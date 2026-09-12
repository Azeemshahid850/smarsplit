import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { Notification } from '../models/Notification.js';

const api = '/api/v1';
const post = (u, url, body) => request(app).post(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const get = (u, url) => request(app).get(url).set('Authorization', `Bearer ${u.accessToken}`);

const spend = (user, body) =>
  post(user, `${api}/transactions`, { title: 'Groceries', amount: 2500, category: 'Food', type: 'DEBIT', ...body });

async function trip() {
  const sara = await makeUser({ name: 'Sara Khan' });
  const bilal = await makeUser({ name: 'Bilal Ahmed' });
  const group = await makeGroup(sara, { title: 'Northern Tour', memberEmails: [bilal.email] });

  await post(sara, `${api}/groups/${group.id}/expenses`, {
    title: 'Hotel', totalAmount: 9000, category: 'Housing', splitType: 'EQUAL',
    paidBy: [{ userId: sara.id, amount: 9000 }], participants: [sara.id, bilal.id],
  });
  await post(bilal, `${api}/groups/${group.id}/expenses`, {
    title: 'Fuel', totalAmount: 4500, category: 'Travel', splitType: 'EQUAL',
    paidBy: [{ userId: bilal.id, amount: 4500 }], participants: [sara.id, bilal.id],
  });

  return { sara, bilal, group };
}

describe('GET /reports/personal/monthly', () => {
  it('reports income, spend, savings rate, top categories and the biggest expense', async () => {
    const user = await makeUser();
    await spend(user, { title: 'Salary', amount: 100000, type: 'CREDIT', date: '2026-09-01' });
    await spend(user, { title: 'Rent', amount: 35000, category: 'Housing', date: '2026-09-02' });
    await spend(user, { title: 'Groceries', amount: 12000, category: 'Food', date: '2026-09-05' });
    await spend(user, { title: 'August rent', amount: 30000, category: 'Housing', date: '2026-08-02' });

    const { report } = (await get(user, `${api}/reports/personal/monthly?month=2026-09`)).body.data;

    expect(report).toMatchObject({ income: 100000, spend: 47000, net: 53000, savingsRate: 53 });
    expect(report.topCategories[0]).toMatchObject({ category: 'Housing', total: 35000, share: 74 });
    expect(report.biggestExpense).toMatchObject({ title: 'Rent', amount: 35000 });
    expect(report.vsLastMonth.spend).toBe(17000);
  });

  it('handles a month with nothing in it', async () => {
    const user = await makeUser();
    const { report } = (await get(user, `${api}/reports/personal/monthly?month=2026-01`)).body.data;
    expect(report).toMatchObject({ income: 0, spend: 0, savingsRate: 0, topCategories: [], biggestExpense: null });
  });
});

describe('GET /reports/personal/trends', () => {
  it('returns one row per month with inflow, outflow and per-category totals', async () => {
    const user = await makeUser();
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 10);

    await spend(user, { title: 'Salary', amount: 90000, type: 'CREDIT', date: thisMonth });
    await spend(user, { title: 'Food', amount: 8000, category: 'Food', date: thisMonth });

    const { report } = (await get(user, `${api}/reports/personal/trends?months=6`)).body.data;

    expect(report.months).toHaveLength(6);
    expect(report.series).toHaveLength(6);
    expect(report.months.at(-1)).toBe(now.toISOString().slice(0, 7));

    const current = report.series.at(-1);
    expect(current).toMatchObject({ inflow: 90000, outflow: 8000, net: 82000, Food: 8000, Travel: 0 });
  });

  it('lists budget vs actual for the current month', async () => {
    const user = await makeUser();
    await request(app).put(`${api}/budgets`).set('Authorization', `Bearer ${user.accessToken}`).send({ category: 'Food', monthlyCap: 10000 });
    await spend(user, { title: 'Food', amount: 8000, category: 'Food', date: new Date().toISOString().slice(0, 10) });

    const { report } = (await get(user, `${api}/reports/personal/trends`)).body.data;
    expect(report.budgetVsActual).toEqual([{ category: 'Food', cap: 10000, actual: 8000 }]);
  });
});

describe('GET /reports/groups/:id/summary', () => {
  it('summarises totals, categories, fairness and settlement efficiency', async () => {
    const { sara, bilal, group } = await trip();
    const { report } = (await get(sara, `${api}/reports/groups/${group.id}/summary`)).body.data;

    expect(report.total).toBe(13500);
    expect(report.perPerson).toBe(6750);
    expect(report.byCategory.map((c) => c.category)).toEqual(['Housing', 'Travel']);
    expect(report.byCategory[0]).toMatchObject({ total: 9000, share: 67 });

    const bySara = report.members.find((m) => m.userId === sara.id);
    const byBilal = report.members.find((m) => m.userId === bilal.id);
    expect(bySara).toMatchObject({ paid: 9000, consumed: 6750, share: 50 });
    expect(byBilal).toMatchObject({ paid: 4500, consumed: 6750 });
    expect(report.timeline.length).toBeGreaterThan(0);
    expect(report.settlementEfficiency).toMatchObject({ optimizedCount: 0, transfersSaved: 0 });
  });

  it('reports the settlement saving once a settlement is recorded', async () => {
    const { sara, group } = await trip();
    await post(sara, `${api}/groups/${group.id}/settle`);

    const { report } = (await get(sara, `${api}/reports/groups/${group.id}/summary`)).body.data;
    expect(report.settlementEfficiency.optimizedCount).toBe(1);
    expect(report.settlementEfficiency.rawDebtCount).toBeGreaterThanOrEqual(1);
  });

  it('403s a non-member', async () => {
    const { group } = await trip();
    const outsider = await makeUser();
    expect((await get(outsider, `${api}/reports/groups/${group.id}/summary`)).status).toBe(403);
  });
});

describe('GET /reports/export', () => {
  it('exports personal transactions as CSV', async () => {
    const user = await makeUser();
    await spend(user, { title: 'Groceries', amount: 2500, date: '2026-09-05', paymentMethod: 'Easypaisa' });

    const res = await get(user, `${api}/reports/export?format=csv&scope=transactions&month=2026-09`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch('text/csv');
    expect(res.headers['content-disposition']).toMatch('smartsplit-transactions-2026-09.csv');
    expect(res.text).toMatch('"Date","Title","Type","Category","Payment method","Amount"');
    expect(res.text).toMatch('Groceries');
    expect(res.text).toMatch('Easypaisa');
  });

  it('exports XLSX with a real workbook header', async () => {
    const user = await makeUser();
    await spend(user, {});
    const res = await get(user, `${api}/reports/export?format=xlsx`).buffer().parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch('spreadsheetml');
    expect(res.body.subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
  });

  it('exports a personal PDF', async () => {
    const user = await makeUser();
    await spend(user, { date: '2026-09-05' });
    const res = await get(user, `${api}/reports/export?format=pdf&month=2026-09`).buffer().parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exports a group trip report as PDF', async () => {
    const { sara, group } = await trip();
    const res = await get(sara, `${api}/reports/export?format=pdf&scope=group&groupId=${group.id}`).buffer().parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(res.headers['content-disposition']).toMatch('northern-tour-expenses.pdf');
  });

  it('403s exporting a group you are not in, and 400s without a groupId', async () => {
    const { group } = await trip();
    const outsider = await makeUser();

    expect((await get(outsider, `${api}/reports/export?scope=group&groupId=${group.id}`)).status).toBe(403);
    expect((await get(outsider, `${api}/reports/export?scope=group`)).status).toBe(400);
  });
});

describe('notification feed', () => {
  it('tells the other members when an expense is added', async () => {
    const { bilal, group } = await trip();
    const res = await get(bilal, `${api}/notifications`);

    const added = res.body.data.notifications.find((n) => n.type === 'EXPENSE_ADDED');
    expect(added.message).toBe('Sara logged Rs 9,000 for Hotel in Northern Tour');
    expect(String(added.groupId)).toBe(group.id);
    expect(res.body.data.unreadCount).toBeGreaterThan(0);
  });

  it('never notifies the person who caused the event', async () => {
    const { sara } = await trip();
    const mine = await get(sara, `${api}/notifications`);
    expect(mine.body.data.notifications.some((n) => n.message.includes('Sara logged'))).toBe(false);
  });

  it('records settlement created and paid events', async () => {
    const { sara, bilal, group } = await trip();
    const { settlements } = (await post(sara, `${api}/groups/${group.id}/settle`)).body.data;
    await request(app).patch(`${api}/settlements/${settlements[0].id}/pay`).set('Authorization', `Bearer ${sara.accessToken}`).send({ isPaid: true });

    const types = (await get(bilal, `${api}/notifications`)).body.data.notifications.map((n) => n.type);
    expect(types).toContain('SETTLEMENT_CREATED');
    expect(types).toContain('SETTLEMENT_PAID');
  });

  it('notifies members when someone joins through an invite link', async () => {
    const sara = await makeUser({ name: 'Sara Khan' });
    const group = await makeGroup(sara);
    const invite = await post(sara, `${api}/groups/${group.id}/members`, { email: 'newbie@demo.pk' });
    const token = invite.body.data.joinLink.split('/join/')[1];

    const newbie = await makeUser({ name: 'Newbie Khan', email: 'newbie@demo.pk' });
    await post(newbie, `${api}/join/${token}`);

    const feed = await get(sara, `${api}/notifications`);
    expect(feed.body.data.notifications[0]).toMatchObject({ type: 'MEMBER_JOINED', message: 'Newbie Khan joined Murree Trip' });
  });

  it('marks one read and then all read', async () => {
    const { bilal } = await trip();
    const before = await get(bilal, `${api}/notifications`);
    const first = before.body.data.notifications[0];

    await request(app).patch(`${api}/notifications/${first.id}/read`).set('Authorization', `Bearer ${bilal.accessToken}`);
    const after = await get(bilal, `${api}/notifications`);
    expect(after.body.data.unreadCount).toBe(before.body.data.unreadCount - 1);

    await request(app).patch(`${api}/notifications/read-all`).set('Authorization', `Bearer ${bilal.accessToken}`);
    expect((await get(bilal, `${api}/notifications`)).body.data.unreadCount).toBe(0);
  });

  it('filters to unread only and scopes to the owner', async () => {
    const { bilal } = await trip();
    const stranger = await makeUser();

    expect((await get(bilal, `${api}/notifications?unreadOnly=true`)).body.data.notifications.length).toBeGreaterThan(0);
    expect((await get(stranger, `${api}/notifications`)).body.data.notifications).toEqual([]);

    const mine = (await get(bilal, `${api}/notifications`)).body.data.notifications[0];
    const stolen = await request(app).patch(`${api}/notifications/${mine.id}/read`).set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(stolen.status).toBe(404);
  });

  it('a failed notification never breaks the money operation', async () => {
    const { sara, group } = await trip();
    const before = await Notification.countDocuments();

    // Even with the collection dropped mid-flight, adding an expense still succeeds.
    await Notification.collection.drop().catch(() => {});
    const res = await post(sara, `${api}/groups/${group.id}/expenses`, {
      title: 'Dinner', totalAmount: 3000, splitType: 'EQUAL',
      paidBy: [{ userId: sara.id, amount: 3000 }], participants: [sara.id],
    });

    expect(res.status).toBe(201);
    expect(before).toBeGreaterThan(0);
  });
});
