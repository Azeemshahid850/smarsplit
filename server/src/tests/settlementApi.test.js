import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { groupBalances } from '../services/balances.js';
import { computeNetBalances } from '../services/settlement.js';
import { GroupExpense } from '../models/GroupExpense.js';
import { Settlement } from '../models/Settlement.js';

const api = '/api/v1';
const post = (u, url, body) => request(app).post(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const get = (u, url) => request(app).get(url).set('Authorization', `Bearer ${u.accessToken}`);

// The Murree Trip from the spec: five members, lopsided spending.
async function murreeTrip() {
  const sara = await makeUser({ name: 'Sara Khan' });
  const bilal = await makeUser({ name: 'Bilal Ahmed' });
  const azeem = await makeUser({ name: 'Azeem Shahid' });
  const hamza = await makeUser({ name: 'Hamza Tariq' });
  const ali = await makeUser({ name: 'Ali Raza' });

  const group = await makeGroup(sara, {
    title: 'Murree Trip',
    memberEmails: [bilal.email, azeem.email, hamza.email, ali.email],
  });

  const everyone = [sara, bilal, azeem, hamza, ali].map((u) => u.id);
  const spend = async (payer, title, totalAmount, category = 'Travel') =>
    post(payer, `${api}/groups/${group.id}/expenses`, {
      title,
      totalAmount,
      category,
      splitType: 'EQUAL',
      paidBy: [{ userId: payer.id, amount: totalAmount }],
      participants: everyone,
    });

  await spend(sara, 'Hotel', 18000, 'Housing');
  await spend(bilal, 'Fuel', 9000);
  await spend(azeem, 'Dinner', 6000, 'Food');
  await spend(hamza, 'Chairlift tickets', 2500);

  return { sara, bilal, azeem, hamza, ali, group, everyone };
}

describe('POST /groups/:id/settle/preview', () => {
  it('computes payments without writing anything', async () => {
    const { sara, group } = await murreeTrip();

    const res = await post(sara, `${api}/groups/${group.id}/settle/preview`);
    expect(res.status).toBe(200);

    const { payments, rawDebtCount, optimizedCount, transfersSaved } = res.body.data;
    expect(optimizedCount).toBe(payments.length);
    expect(payments.length).toBeLessThanOrEqual(4); // V − 1 for five members
    expect(rawDebtCount).toBeGreaterThan(optimizedCount);
    expect(transfersSaved).toBe(rawDebtCount - optimizedCount);
    expect(payments[0]).toMatchObject({ fromName: expect.any(String), toName: expect.any(String), amount: expect.any(Number) });

    expect(await Settlement.countDocuments({ groupId: group.id })).toBe(0); // nothing persisted
    const after = await get(sara, `${api}/groups/${group.id}`);
    expect(after.body.data.group.status).toBe('ACTIVE');
  });

  it('applying the preview zeroes every balance', async () => {
    const { sara, group } = await murreeTrip();

    const before = await get(sara, `${api}/groups/${group.id}/balances`);
    const net = Object.fromEntries(before.body.data.balances.map((b) => [b.userId, b.net]));

    const { payments } = (await post(sara, `${api}/groups/${group.id}/settle/preview`)).body.data;
    for (const p of payments) {
      net[p.from] += p.amount;
      net[p.to] -= p.amount;
    }

    expect(Object.values(net).every((v) => v === 0)).toBe(true);
  });

  it('the aggregation and the pure function agree on the same ledger', async () => {
    const { group } = await murreeTrip();

    const [{ net }, expenses] = await Promise.all([
      groupBalances(group.id),
      GroupExpense.find({ groupId: group.id, deletedAt: null }).lean(),
    ]);
    const pure = computeNetBalances(expenses, []);

    expect(Object.fromEntries(net)).toEqual(Object.fromEntries(pure));
  });

  it('403s a non-member', async () => {
    const { group } = await murreeTrip();
    const outsider = await makeUser();
    const res = await post(outsider, `${api}/groups/${group.id}/settle/preview`);
    expect(res.status).toBe(403);
  });
});

describe('POST /groups/:id/settle', () => {
  it('persists the payments, marks the group SETTLED and writes an audit entry', async () => {
    const { sara, group } = await murreeTrip();

    const preview = (await post(sara, `${api}/groups/${group.id}/settle/preview`)).body.data;
    const res = await post(sara, `${api}/groups/${group.id}/settle`);

    expect(res.status).toBe(201);
    expect(res.body.data.settlements).toHaveLength(preview.optimizedCount);
    expect(res.body.data.groupStatus).toBe('SETTLED');
    expect(res.body.data.transfersSaved).toBe(preview.transfersSaved);
    expect(res.body.data.settlements.every((s) => s.isPaid === false)).toBe(true);

    const listed = await get(sara, `${api}/groups/${group.id}/settlements`);
    expect(listed.body.data.auditTrail[0]).toMatchObject({ action: 'SETTLEMENT_CREATED' });
    expect(listed.body.data.auditTrail[0].detail.optimizedCount).toBe(preview.optimizedCount);
  });

  it('refuses a second settlement while one is outstanding', async () => {
    const { sara, group } = await murreeTrip();
    await post(sara, `${api}/groups/${group.id}/settle`);

    const again = await post(sara, `${api}/groups/${group.id}/settle`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SETTLEMENT_IN_PROGRESS');
  });

  it('refuses to settle a group where nobody owes anything', async () => {
    const sara = await makeUser();
    const bilal = await makeUser();
    const group = await makeGroup(sara, { memberEmails: [bilal.email] });

    const res = await post(sara, `${api}/groups/${group.id}/settle`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_TO_SETTLE');
  });
});

describe('PATCH /settlements/:id/pay', () => {
  it('marks a payment paid and clears that much debt from the balances', async () => {
    const { sara, group } = await murreeTrip();
    const { settlements } = (await post(sara, `${api}/groups/${group.id}/settle`)).body.data;

    const first = settlements[0];
    const res = await request(app)
      .patch(`${api}/settlements/${first.id}/pay`)
      .set('Authorization', `Bearer ${sara.accessToken}`)
      .send({ isPaid: true });

    expect(res.status).toBe(200);
    expect(res.body.data.settlement.isPaid).toBe(true);
    expect(res.body.data.outstanding).toBe(settlements.length - 1);

    const balances = await get(sara, `${api}/groups/${group.id}/balances`);
    const net = Object.fromEntries(balances.body.data.balances.map((b) => [b.userId, b.net]));
    expect(net[first.from]).toBe(0); // that debtor is square now
    expect(balances.body.data.netsToZero).toBe(true);
  });

  it('everyone paid leaves every balance at zero', async () => {
    const { sara, group } = await murreeTrip();
    const { settlements } = (await post(sara, `${api}/groups/${group.id}/settle`)).body.data;

    for (const s of settlements) {
      await request(app).patch(`${api}/settlements/${s.id}/pay`).set('Authorization', `Bearer ${sara.accessToken}`).send({ isPaid: true });
    }

    const balances = await get(sara, `${api}/groups/${group.id}/balances`);
    expect(balances.body.data.balances.every((b) => b.net === 0)).toBe(true);

    const preview = await post(sara, `${api}/groups/${group.id}/settle/preview`);
    expect(preview.body.data.payments).toEqual([]); // nothing left to move
  });

  it('403s a non-member trying to mark a payment paid', async () => {
    const { sara, group } = await murreeTrip();
    const { settlements } = (await post(sara, `${api}/groups/${group.id}/settle`)).body.data;
    const outsider = await makeUser();

    const res = await request(app)
      .patch(`${api}/settlements/${settlements[0].id}/pay`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ isPaid: true });

    expect(res.status).toBe(403);
  });
});
