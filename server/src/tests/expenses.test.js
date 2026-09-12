import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';

const api = '/api/v1';

// A group of three, all active, with handles for each member.
async function trio() {
  const sara = await makeUser({ name: 'Sara Khan' });
  const bilal = await makeUser({ name: 'Bilal Ahmed' });
  const ali = await makeUser({ name: 'Ali Raza' });
  const group = await makeGroup(sara, { memberEmails: [bilal.email, ali.email] });
  return { sara, bilal, ali, group };
}

const post = (user, url, body) => request(app).post(url).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const get = (user, url) => request(app).get(url).set('Authorization', `Bearer ${user.accessToken}`);

describe('POST /groups/:id/expenses', () => {
  it('creates an EQUAL split and balances to the rupee', async () => {
    const { sara, bilal, ali, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel',
      totalAmount: 100,
      category: 'Travel',
      splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 100 }],
      participants: [sara.id, bilal.id, ali.id],
    });

    expect(res.status).toBe(201);
    const { expense } = res.body.data;
    expect(expense.splits.reduce((runningTotal, splitEntry) => runningTotal + splitEntry.share, 0)).toBe(100);
    expect(expense.splits.find((splitEntry) => splitEntry.userId === sara.id).share).toBe(34); // payer takes the remainder
  });

  it('accepts multiple payers covering the total', async () => {
    const { sara, bilal, ali, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Hotel',
      totalAmount: 9000,
      splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 6000 }, { userId: bilal.id, amount: 3000 }],
      participants: [sara.id, bilal.id, ali.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.expense.paidBy).toHaveLength(2);
  });

  it('rejects payers who do not cover the total', async () => {
    const { sara, bilal, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Hotel',
      totalAmount: 9000,
      splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 6000 }],
      participants: [sara.id, bilal.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SPLIT_INVALID');
    expect(res.body.error.message).toMatch('Rs 3,000 short');
  });

  it('rejects EXACT shares that miss the total', async () => {
    const { sara, bilal, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Dinner',
      totalAmount: 1000,
      splitType: 'EXACT',
      paidBy: [{ userId: sara.id, amount: 1000 }],
      exact: [{ userId: sara.id, share: 600 }, { userId: bilal.id, share: 350 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch("You're Rs 50 short");
  });

  it('rejects percentages that do not reach 100', async () => {
    const { sara, bilal, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Dinner',
      totalAmount: 1000,
      splitType: 'PERCENTAGE',
      paidBy: [{ userId: sara.id, amount: 1000 }],
      percentages: [{ userId: sara.id, percent: 60 }, { userId: bilal.id, percent: 30 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch('90%');
  });

  it('derives LINE_ITEM shares from the items', async () => {
    const { sara, bilal, ali, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Dhaba',
      totalAmount: 900,
      splitType: 'LINE_ITEM',
      paidBy: [{ userId: sara.id, amount: 900 }],
      items: [
        { name: 'Biryani', qty: 2, price: 300, sharedBy: [sara.id, bilal.id] },
        { name: 'Juice', qty: 1, price: 300, sharedBy: [ali.id] },
      ],
    });

    expect(res.status).toBe(201);
    const shares = Object.fromEntries(res.body.data.expense.splits.map((splitEntry) => [splitEntry.userId, splitEntry.share]));
    expect(shares).toEqual({ [sara.id]: 300, [bilal.id]: 300, [ali.id]: 300 });
  });

  it('refuses to name someone who is not an active member', async () => {
    const { sara, group } = await trio();
    const outsider = await makeUser();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel',
      totalAmount: 100,
      splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 100 }],
      participants: [sara.id, outsider.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('403s a non-member trying to add an expense', async () => {
    const { group } = await trio();
    const outsider = await makeUser();

    const res = await post(outsider, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel',
      totalAmount: 100,
      splitType: 'EQUAL',
      paidBy: [{ userId: outsider.id, amount: 100 }],
      participants: [outsider.id],
    });

    expect(res.status).toBe(403);
  });

  it('rejects fractional rupees', async () => {
    const { sara, group } = await trio();

    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Chai',
      totalAmount: 100.5,
      splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 100.5 }],
      participants: [sara.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /groups/:id/expenses', () => {
  it('paginates and filters by category, payer and date', async () => {
    const { sara, bilal, ali, group } = await trio();
    const base = { splitType: 'EQUAL', participants: [sara.id, bilal.id, ali.id] };

    await post(sara, `${api}/groups/${group.id}/expenses`, {
      ...base, title: 'Fuel', totalAmount: 3000, category: 'Travel', date: '2026-01-10',
      paidBy: [{ userId: sara.id, amount: 3000 }],
    });
    await post(bilal, `${api}/groups/${group.id}/expenses`, {
      ...base, title: 'Dinner', totalAmount: 1500, category: 'Food', date: '2026-02-10',
      paidBy: [{ userId: bilal.id, amount: 1500 }],
    });

    const all = await get(sara, `${api}/groups/${group.id}/expenses`);
    expect(all.body.data.expenses).toHaveLength(2);
    expect(all.body.data.pagination).toMatchObject({ page: 1, total: 2, pages: 1 });

    const food = await get(sara, `${api}/groups/${group.id}/expenses?category=Food`);
    expect(food.body.data.expenses.map((expenseRow) => expenseRow.title)).toEqual(['Dinner']);

    const byBilal = await get(sara, `${api}/groups/${group.id}/expenses?payer=${bilal.id}`);
    expect(byBilal.body.data.expenses.map((expenseRow) => expenseRow.title)).toEqual(['Dinner']);

    const january = await get(sara, `${api}/groups/${group.id}/expenses?from=2026-01-01&to=2026-01-31`);
    expect(january.body.data.expenses.map((expenseRow) => expenseRow.title)).toEqual(['Fuel']);

    const paged = await get(sara, `${api}/groups/${group.id}/expenses?limit=1&page=2`);
    expect(paged.body.data.expenses).toHaveLength(1);
    expect(paged.body.data.pagination.pages).toBe(2);
  });
});

describe('PATCH / DELETE /expenses/:id', () => {
  it('lets the payer edit and recomputes the splits', async () => {
    const { sara, bilal, ali, group } = await trio();
    const created = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 3000 }], participants: [sara.id, bilal.id, ali.id],
    });

    const res = await request(app)
      .patch(`${api}/expenses/${created.body.data.expense.id}`)
      .set('Authorization', `Bearer ${sara.accessToken}`)
      .send({ totalAmount: 4500, paidBy: [{ userId: sara.id, amount: 4500 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.splits.reduce((runningTotal, splitEntry) => runningTotal + splitEntry.share, 0)).toBe(4500);
    expect(res.body.data.expense.splits.every((splitEntry) => splitEntry.share === 1500)).toBe(true);
  });

  it('blocks a non-payer, non-admin member from editing', async () => {
    const { sara, bilal, ali, group } = await trio();
    const created = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 3000 }], participants: [sara.id, bilal.id, ali.id],
    });

    const res = await request(app)
      .patch(`${api}/expenses/${created.body.data.expense.id}`)
      .set('Authorization', `Bearer ${ali.accessToken}`)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_EDIT_EXPENSE');
  });

  it('allows any member to edit when anyoneCanEdit is on', async () => {
    const { sara, bilal, ali, group } = await trio();
    await request(app)
      .patch(`${api}/groups/${group.id}`)
      .set('Authorization', `Bearer ${sara.accessToken}`)
      .send({ settings: { anyoneCanEdit: true } });

    const created = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 3000 }], participants: [sara.id, bilal.id, ali.id],
    });

    const res = await request(app)
      .patch(`${api}/expenses/${created.body.data.expense.id}`)
      .set('Authorization', `Bearer ${ali.accessToken}`)
      .send({ title: 'Petrol' });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.title).toBe('Petrol');
  });

  it('soft deletes and drops the expense from lists and balances', async () => {
    const { sara, bilal, ali, group } = await trio();
    const created = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 3000 }], participants: [sara.id, bilal.id, ali.id],
    });

    const del = await request(app)
      .delete(`${api}/expenses/${created.body.data.expense.id}`)
      .set('Authorization', `Bearer ${sara.accessToken}`);
    expect(del.status).toBe(200);

    const list = await get(sara, `${api}/groups/${group.id}/expenses`);
    expect(list.body.data.expenses).toEqual([]);

    const balances = await get(sara, `${api}/groups/${group.id}/balances`);
    expect(balances.body.data.balances.every((budgetRow) => budgetRow.net === 0)).toBe(true);
  });
});

describe('GET /groups/:id/balances', () => {
  it('computes net per member and always nets to zero', async () => {
    const { sara, bilal, ali, group } = await trio();
    const all = [sara.id, bilal.id, ali.id];

    await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Hotel', totalAmount: 9000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 9000 }], participants: all,
    });
    await post(bilal, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: bilal.id, amount: 3000 }], participants: all,
    });

    const res = await get(sara, `${api}/groups/${group.id}/balances`);
    const net = Object.fromEntries(res.body.data.balances.map((budgetRow) => [budgetRow.userId, budgetRow.net]));

    expect(res.body.data.totalSpent).toBe(12000);
    expect(res.body.data.netsToZero).toBe(true);
    expect(net[sara.id]).toBe(5000); // paid 9000, owes 4000
    expect(net[bilal.id]).toBe(-1000); // paid 3000, owes 4000
    expect(net[ali.id]).toBe(-4000);
  });

  it('shows totals and my balance on the groups list', async () => {
    const { sara, bilal, ali, group } = await trio();
    await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Hotel', totalAmount: 9000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 9000 }], participants: [sara.id, bilal.id, ali.id],
    });

    const list = await get(sara, `${api}/groups`);
    expect(list.body.data.groups[0]).toMatchObject({ totalSpent: 9000, myBalance: 6000 });

    const theirs = await get(ali, `${api}/groups`);
    expect(theirs.body.data.groups[0].myBalance).toBe(-3000);
  });
});
