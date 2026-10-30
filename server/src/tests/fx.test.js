import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { clearRateCache } from '../services/fx.js';

const api = '/api/v1';

// The provider quotes units per rupee: 0.0125 AED → Rs 80 per AED, 0.004 USD → Rs 250 per USD.
const providerReply = { result: 'success', time_last_update_unix: 1793318400, rates: { PKR: 1, AED: 0.0125, USD: 0.004 } };
const providerUp = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(providerReply));
const providerDown = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

beforeEach(() => clearRateCache());
afterEach(() => vi.restoreAllMocks());

async function trio() {
  const sara = await makeUser({ name: 'Sara Khan' });
  const bilal = await makeUser({ name: 'Bilal Ahmed' });
  const ali = await makeUser({ name: 'Ali Raza' });
  const group = await makeGroup(sara, { memberEmails: [bilal.email, ali.email] });
  return { sara, bilal, ali, group };
}

const post = (user, url, body) => request(app).post(url).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const patch = (user, url, body) => request(app).patch(url).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const get = (user, url) => request(app).get(url).set('Authorization', `Bearer ${user.accessToken}`);

const dubaiDinner = ({ sara, bilal, ali }, overrides = {}) => ({
  title: 'Dinner in Dubai',
  currency: 'AED',
  totalAmount: 240,
  splitType: 'EQUAL',
  paidBy: [{ userId: sara.id, amount: 240 }],
  participants: [sara.id, bilal.id, ali.id],
  ...overrides,
});

describe('GET /fx/rates', () => {
  it('returns rupees per unit with the provider attribution', async () => {
    providerUp();
    const sara = await makeUser();
    const res = await get(sara, `${api}/fx/rates`);

    expect(res.status).toBe(200);
    expect(res.body.data.rates).toMatchObject({ AED: 80, USD: 250 });
    expect(res.body.data.stale).toBe(false);
    expect(res.body.data.source.name).toBe('ExchangeRate-API');
  });

  it('falls back to the saved rates when the provider is down', async () => {
    providerUp();
    const sara = await makeUser();
    await get(sara, `${api}/fx/rates`); // saves today's copy
    vi.restoreAllMocks();
    clearRateCache();
    providerDown();

    const res = await get(sara, `${api}/fx/rates`);
    expect(res.status).toBe(200);
    expect(res.body.data.rates.AED).toBe(80);
    expect(res.body.data.stale).toBe(true);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).get(`${api}/fx/rates`)).status).toBe(401);
  });
});

describe('foreign-currency group expenses', () => {
  it('stores integer rupees and keeps the AED figures for display', async () => {
    providerUp();
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people));

    expect(res.status).toBe(201);
    const { expense } = res.body.data;
    expect(expense.totalAmount).toBe(19200);
    expect(expense.currency).toBe('AED');
    expect(expense.fx).toMatchObject({ currency: 'AED', rate: 80, totalAmount: 240 });
    expect(expense.splits.map((splitEntry) => splitEntry.share)).toEqual([6400, 6400, 6400]);

    const balances = await get(people.sara, `${api}/groups/${people.group.id}/balances`);
    expect(balances.body.data.netsToZero).toBe(true);
    expect(balances.body.data.balances.find((row) => row.userId === people.sara.id).net).toBe(12800);
  });

  it('accepts cents in a foreign currency', async () => {
    providerUp();
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people, {
      currency: 'USD',
      totalAmount: 12.34,
      paidBy: [{ userId: people.sara.id, amount: 12.34 }],
    }));

    expect(res.status).toBe(201);
    expect(res.body.data.expense.totalAmount).toBe(3085); // 12.34 × 250
  });

  it('still insists on whole rupees in PKR', async () => {
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people, {
      currency: undefined,
      totalAmount: 100.5,
      paidBy: [{ userId: people.sara.id, amount: 100.5 }],
    }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reports a payer shortfall in the foreign currency', async () => {
    providerUp();
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people, {
      paidBy: [{ userId: people.sara.id, amount: 200 }],
    }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'SPLIT_INVALID', message: 'Payers are AED 40 short' });
  });

  it('refuses a currency outside the supported list', async () => {
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people, { currency: 'XYZ' }));
    expect(res.status).toBe(400);
  });

  it('answers 503 when no rates were ever fetched and the provider is down', async () => {
    providerDown();
    const people = await trio();
    const res = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people));

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('FX_UNAVAILABLE');
  });

  it('keeps the foreign figures on a title-only edit and replaces them on a currency edit', async () => {
    providerUp();
    const people = await trio();
    const created = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people));
    const url = `${api}/expenses/${created.body.data.expense.id}`;

    const renamed = await patch(people.sara, url, { title: 'Dinner at the Marina' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.expense).toMatchObject({ title: 'Dinner at the Marina', totalAmount: 19200, currency: 'AED' });

    const inDollars = await patch(people.sara, url, {
      currency: 'USD',
      totalAmount: 60,
      paidBy: [{ userId: people.sara.id, amount: 60 }],
      participants: [people.sara.id, people.bilal.id, people.ali.id],
    });
    expect(inDollars.status).toBe(200);
    expect(inDollars.body.data.expense).toMatchObject({ totalAmount: 15000, currency: 'USD' });

    const inRupees = await patch(people.sara, url, { totalAmount: 9000, paidBy: [{ userId: people.sara.id, amount: 9000 }] });
    expect(inRupees.status).toBe(200);
    expect(inRupees.body.data.expense).toMatchObject({ totalAmount: 9000, currency: 'PKR', fx: null });
  });

  it('keeps the original rate when an edit keeps the currency', async () => {
    providerUp();
    const people = await trio();
    const created = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people));

    // The dirham moves to Rs 100 overnight.
    vi.restoreAllMocks();
    clearRateCache();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ ...providerReply, rates: { ...providerReply.rates, AED: 0.01 } }));

    const res = await patch(people.sara, `${api}/expenses/${created.body.data.expense.id}`, {
      title: 'Dinner in Dubai (fixed typo)',
      currency: 'AED',
      totalAmount: 240,
      paidBy: [{ userId: people.sara.id, amount: 240 }],
      participants: [people.sara.id, people.bilal.id, people.ali.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.expense).toMatchObject({ totalAmount: 19200, fx: { rate: 80 } });
  });

  it('wants the amount and payers whenever an edit names a currency', async () => {
    providerUp();
    const people = await trio();
    const created = await post(people.sara, `${api}/groups/${people.group.id}/expenses`, dubaiDinner(people));
    const res = await patch(people.sara, `${api}/expenses/${created.body.data.expense.id}`, { currency: 'USD' });
    expect(res.status).toBe(400);
  });
});
