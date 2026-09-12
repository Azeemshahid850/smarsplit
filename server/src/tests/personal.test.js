import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser } from './helpers.js';
import { PersonalExpense } from '../models/PersonalExpense.js';
import { runDueRecurring, advance } from '../services/recurring.js';

const api = '/api/v1';
const post = (u, url, body) => request(app).post(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const get = (u, url) => request(app).get(url).set('Authorization', `Bearer ${u.accessToken}`);

const spend = (user, body) =>
  post(user, `${api}/transactions`, { title: 'Groceries', amount: 2500, category: 'Food', type: 'DEBIT', ...body });

describe('transactions CRUD', () => {
  it('creates a debit and returns it', async () => {
    const user = await makeUser();
    const res = await spend(user, { paymentMethod: 'JazzCash' });

    expect(res.status).toBe(201);
    expect(res.body.data.transaction).toMatchObject({ title: 'Groceries', amount: 2500, type: 'DEBIT', paymentMethod: 'JazzCash' });
  });

  it('accepts every Pakistani payment method', async () => {
    const user = await makeUser();
    for (const paymentMethod of ['Cash', 'Bank Transfer', 'Card', 'JazzCash', 'Easypaisa', 'Raast']) {
      expect((await spend(user, { paymentMethod })).status).toBe(201);
    }
  });

  it('rejects fractional rupees and unknown categories', async () => {
    const user = await makeUser();
    expect((await spend(user, { amount: 99.5 })).status).toBe(400);
    expect((await spend(user, { category: 'Crypto' })).status).toBe(400);
  });

  it('filters by month, category and type', async () => {
    const user = await makeUser();
    await spend(user, { title: 'Salary', amount: 90000, type: 'CREDIT', category: 'Misc', date: '2026-09-01' });
    await spend(user, { title: 'Groceries', amount: 2500, date: '2026-09-05' });
    await spend(user, { title: 'Old bill', amount: 1200, category: 'Utilities', date: '2026-08-20' });

    expect((await get(user, `${api}/transactions?month=2026-09`)).body.data.transactions).toHaveLength(2);
    expect((await get(user, `${api}/transactions?type=CREDIT`)).body.data.transactions).toHaveLength(1);
    expect((await get(user, `${api}/transactions?category=Utilities`)).body.data.transactions).toHaveLength(1);
    expect((await get(user, `${api}/transactions?month=2026-08`)).body.data.transactions).toHaveLength(1);
  });

  it('never shows one user another user rows', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await spend(mine, {});

    expect((await get(theirs, `${api}/transactions`)).body.data.transactions).toEqual([]);

    const id = (await get(mine, `${api}/transactions`)).body.data.transactions[0].id;
    const stolen = await request(app).patch(`${api}/transactions/${id}`).set('Authorization', `Bearer ${theirs.accessToken}`).send({ title: 'Hijacked' });
    expect(stolen.status).toBe(404);
  });

  it('updates and deletes my own transaction', async () => {
    const user = await makeUser();
    const id = (await spend(user, {})).body.data.transaction.id;

    const patched = await request(app).patch(`${api}/transactions/${id}`).set('Authorization', `Bearer ${user.accessToken}`).send({ amount: 3000 });
    expect(patched.body.data.transaction.amount).toBe(3000);

    const deleted = await request(app).delete(`${api}/transactions/${id}`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(deleted.status).toBe(200);
    expect((await get(user, `${api}/transactions`)).body.data.transactions).toEqual([]);
  });
});

describe('recurring engine', () => {
  it('rejects a recurring transaction with no interval', async () => {
    const user = await makeUser();
    const res = await spend(user, { isRecurring: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch('how often');
  });

  it('schedules the next run one interval ahead', async () => {
    const user = await makeUser();
    const res = await spend(user, { title: 'Rent', amount: 35000, category: 'Housing', date: '2026-09-01', isRecurring: true, recurringInterval: 'monthly' });

    expect(res.body.data.transaction.recurring.interval).toBe('monthly');
    expect(new Date(res.body.data.transaction.recurring.nextRunAt).toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('materialises due rows and advances the schedule', async () => {
    const user = await makeUser();
    await spend(user, { title: 'Rent', amount: 35000, category: 'Housing', date: '2026-09-01', isRecurring: true, recurringInterval: 'monthly' });

    const { created } = await runDueRecurring(new Date('2026-10-02'));
    expect(created).toBe(1);

    const rows = await PersonalExpense.find({ userId: user.id }).sort({ date: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[1].generatedFrom).not.toBeNull();
    expect(rows[1].isRecurring).toBe(false); // generated rows never recur themselves
    expect(rows[0].recurring.nextRunAt.toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('catches up on several missed periods at once', async () => {
    const user = await makeUser();
    await spend(user, { title: 'Rent', amount: 35000, date: '2026-09-01', isRecurring: true, recurringInterval: 'monthly' });

    const { created } = await runDueRecurring(new Date('2026-12-15'));
    expect(created).toBe(3); // October, November, December
    expect(await PersonalExpense.countDocuments({ userId: user.id })).toBe(4);
  });

  it('creates nothing when nothing is due', async () => {
    const user = await makeUser();
    await spend(user, { date: '2026-09-01', isRecurring: true, recurringInterval: 'monthly' });

    expect((await runDueRecurring(new Date('2026-09-15'))).created).toBe(0);
  });

  it('advance() steps weekly and monthly', () => {
    expect(advance(new Date('2026-09-01'), 'weekly').toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(advance(new Date('2026-01-31'), 'monthly').getMonth()).toBe(2); // Jan 31 → Mar 3, JS month arithmetic
  });
});

describe('budgets and summary', () => {
  it('upserts a cap rather than duplicating it', async () => {
    const user = await makeUser();
    await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Food', monthlyCap: 20000 });
    await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Food', monthlyCap: 25000 });

    const res = await get(user, `${api}/budgets`);
    expect(res.body.data.budgets).toHaveLength(1);
    expect(res.body.data.budgets[0].monthlyCap).toBe(25000);
  });

  it('summarises income, spend, net and per-category consumption', async () => {
    const user = await makeUser();
    await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Food', monthlyCap: 10000 });

    await spend(user, { title: 'Salary', amount: 90000, type: 'CREDIT', date: '2026-09-01' });
    await spend(user, { title: 'Groceries', amount: 8500, category: 'Food', date: '2026-09-05' });
    await spend(user, { title: 'Electricity', amount: 4200, category: 'Utilities', date: '2026-09-07' });
    await spend(user, { title: 'August food', amount: 6000, category: 'Food', date: '2026-08-10' });

    const res = await get(user, `${api}/personal/summary?month=2026-09`);
    const { income, spend: spent, net, byCategory, lastMonthSpend } = res.body.data;

    expect(income).toBe(90000);
    expect(spent).toBe(12700);
    expect(net).toBe(77300);
    expect(lastMonthSpend).toBe(6000);

    const food = byCategory.find((c) => c.category === 'Food');
    expect(food).toMatchObject({ total: 8500, cap: 10000, consumed: 85 }); // amber band
    expect(byCategory.find((c) => c.category === 'Utilities')).toMatchObject({ total: 4200, cap: null, consumed: null });
    expect(byCategory.some((c) => c.category === 'Travel')).toBe(false); // no spend, no cap, not listed
  });

  it('gives an empty month zeroes rather than an error', async () => {
    const user = await makeUser();
    const res = await get(user, `${api}/personal/summary?month=2026-01`);
    expect(res.body.data).toMatchObject({ income: 0, spend: 0, net: 0, byCategory: [] });
  });

  it('401s without a token', async () => {
    expect((await request(app).get(`${api}/personal/summary`)).status).toBe(401);
  });
});
