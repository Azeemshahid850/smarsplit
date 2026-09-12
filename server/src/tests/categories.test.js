import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { DEFAULT_CATEGORIES } from '../services/categories.js';

const api = '/api/v1';
const post = (u, url, body) => request(app).post(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const get = (u, url) => request(app).get(url).set('Authorization', `Bearer ${u.accessToken}`);
const del = (u, url) => request(app).delete(url).set('Authorization', `Bearer ${u.accessToken}`);

const addCategory = (user, name) => post(user, `${api}/categories`, { name });

describe('GET /categories', () => {
  it('starts with the seven defaults and no custom ones', async () => {
    const user = await makeUser();
    const { defaults, custom, all } = (await get(user, `${api}/categories`)).body.data;

    expect(defaults).toEqual(DEFAULT_CATEGORIES);
    expect(custom).toEqual([]);
    expect(all).toHaveLength(7);
  });

  it('appends the user own categories, alphabetically', async () => {
    const user = await makeUser();
    await addCategory(user, 'Rent Deposit');
    await addCategory(user, 'Education');

    const { custom, all } = (await get(user, `${api}/categories`)).body.data;
    expect(custom.map((c) => c.name)).toEqual(['Education', 'Rent Deposit']);
    expect(all).toEqual([...DEFAULT_CATEGORIES, 'Education', 'Rent Deposit']);
  });

  it('keeps one user categories away from another', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await addCategory(mine, 'Education');

    expect((await get(theirs, `${api}/categories`)).body.data.custom).toEqual([]);
  });
});

describe('POST /categories', () => {
  it('creates one', async () => {
    const user = await makeUser();
    const res = await addCategory(user, 'Education');

    expect(res.status).toBe(201);
    expect(res.body.data.category).toMatchObject({ name: 'Education', id: expect.any(String) });
  });

  it('refuses a duplicate, ignoring case', async () => {
    const user = await makeUser();
    await addCategory(user, 'Education');

    const again = await addCategory(user, 'education');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CATEGORY_EXISTS');
  });

  it('refuses one that clashes with a built-in name', async () => {
    const user = await makeUser();
    const res = await addCategory(user, 'utilities');

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch('already a built-in');
  });

  it('rejects empty, over-long and symbol-laden names', async () => {
    const user = await makeUser();
    expect((await addCategory(user, 'x')).status).toBe(400);
    expect((await addCategory(user, 'x'.repeat(31))).status).toBe(400);
    expect((await addCategory(user, '<script>')).status).toBe(400);
  });

  it('accepts the punctuation real category names use', async () => {
    const user = await makeUser();
    for (const name of ['Kids & School', "Eid al-Fitr", 'Home/Office']) {
      expect((await addCategory(user, name)).status).toBe(201);
    }
  });
});

describe('custom categories in use', () => {
  it('accepts a transaction in a custom category and counts it in the summary', async () => {
    const user = await makeUser();
    await addCategory(user, 'Education');

    const created = await post(user, `${api}/transactions`, {
      title: 'Semester fee', amount: 65000, category: 'Education', type: 'DEBIT', date: '2026-09-05',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.transaction.category).toBe('Education');

    const summary = await get(user, `${api}/personal/summary?month=2026-09`);
    expect(summary.body.data.byCategory.find((c) => c.category === 'Education')).toMatchObject({ total: 65000 });
  });

  it('rejects a category the user never created', async () => {
    const user = await makeUser();
    const res = await post(user, `${api}/transactions`, { title: 'Semester fee', amount: 65000, category: 'Education' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_CATEGORY');
  });

  it('rejects another user custom category', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await addCategory(theirs, 'Education');

    const res = await post(mine, `${api}/transactions`, { title: 'Fee', amount: 1000, category: 'Education' });
    expect(res.status).toBe(400);
  });

  it('normalises the case of an accepted category', async () => {
    const user = await makeUser();
    await addCategory(user, 'Education');

    const res = await post(user, `${api}/transactions`, { title: 'Fee', amount: 1000, category: 'education' });
    expect(res.body.data.transaction.category).toBe('Education');
  });

  it('allows a budget on a custom category and refuses one on an unknown category', async () => {
    const user = await makeUser();
    await addCategory(user, 'Education');

    const okBudget = await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Education', monthlyCap: 70000 });
    expect(okBudget.status).toBe(201);

    const bad = await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Yachts', monthlyCap: 1000 });
    expect(bad.status).toBe(400);
  });

  it('lets a group expense use any active member custom category', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    await addCategory(friend, 'Camping Gear'); // the friend invented it

    const res = await post(owner, `${api}/groups/${group.id}/expenses`, {
      title: 'Tents', totalAmount: 12000, category: 'Camping Gear', splitType: 'EQUAL',
      paidBy: [{ userId: owner.id, amount: 12000 }], participants: [owner.id, friend.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.expense.category).toBe('Camping Gear');
  });

  it('refuses a group expense in a category nobody in the group has', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await addCategory(stranger, 'Camping Gear');
    const group = await makeGroup(owner);

    const res = await post(owner, `${api}/groups/${group.id}/expenses`, {
      title: 'Tents', totalAmount: 12000, category: 'Camping Gear', splitType: 'EQUAL',
      paidBy: [{ userId: owner.id, amount: 12000 }], participants: [owner.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_CATEGORY');
  });
});

describe('DELETE /categories/:id', () => {
  it('reports usage before deleting', async () => {
    const user = await makeUser();
    const { id } = (await addCategory(user, 'Education')).body.data.category;
    await post(user, `${api}/transactions`, { title: 'Fee', amount: 1000, category: 'Education' });

    const usage = await get(user, `${api}/categories/${id}/usage`);
    expect(usage.body.data.usage).toMatchObject({ transactions: 1, total: 1 });
  });

  it('deletes it and leaves the history intact', async () => {
    const user = await makeUser();
    const { id } = (await addCategory(user, 'Education')).body.data.category;
    await post(user, `${api}/transactions`, { title: 'Fee', amount: 1000, category: 'Education', date: '2026-09-05' });

    const res = await del(user, `${api}/categories/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stillUsedBy.transactions).toBe(1);

    // Gone from the picker…
    expect((await get(user, `${api}/categories`)).body.data.all).not.toContain('Education');

    // …but the money it recorded is still visible and correctly attributed.
    const summary = await get(user, `${api}/personal/summary?month=2026-09`);
    expect(summary.body.data.byCategory.find((c) => c.category === 'Education')).toMatchObject({ total: 1000 });

    const list = await get(user, `${api}/transactions?category=Education`);
    expect(list.body.data.transactions).toHaveLength(1);
  });

  it('404s someone else category and an unknown id', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    const { id } = (await addCategory(theirs, 'Education')).body.data.category;

    expect((await del(mine, `${api}/categories/${id}`)).status).toBe(404);
    expect((await del(mine, `${api}/categories/64b7f0c2b1a2c3d4e5f60718`)).status).toBe(404);
  });

  it('401s the whole surface without a token', async () => {
    expect((await request(app).get(`${api}/categories`)).status).toBe(401);
    expect((await request(app).post(`${api}/categories`).send({ name: 'Education' })).status).toBe(401);
  });
});
