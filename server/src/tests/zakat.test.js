import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { calculateZakat } from '../services/zakat.js';
import { clearRateCache } from '../services/fx.js';
import { clearMetalCache } from '../services/metalRates.js';

const api = '/api/v1';
const as = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);
// Silver Rs 3,000 a tola puts the silver nisab at 52.5 × 3,000 = Rs 157,500.
const RATES = { goldPerTola: 250000, silverPerTola: 3000 };

// Rs 250 per USD; gold $3,110.35 and silver $31.1035 an ounce → Rs 291,600 and Rs 2,916 a tola.
const replies = {
  'open.er-api.com': { result: 'success', time_last_update_unix: 1793318400, rates: { PKR: 1, USD: 0.004 } },
  '/price/XAU': { currency: 'USD', price: 3110.35, symbol: 'XAU' },
  '/price/XAG': { currency: 'USD', price: 31.1035, symbol: 'XAG' },
};
const providersUp = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => Response.json(replies[Object.keys(replies).find((key) => String(url).includes(key))]));
const providersDown = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

beforeEach(() => {
  clearRateCache();
  clearMetalCache();
  providersDown(); // no test reaches the real internet
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  vi.restoreAllMocks();
});

describe('calculateZakat', () => {
  it('owes nothing below the nisab', () => {
    const result = calculateZakat({ cash: 157499, ...RATES });
    expect(result).toMatchObject({ nisab: 157500, net: 157499, due: false, zakat: 0 });
  });

  it('owes 2.5% at or above the nisab, rounded up to the rupee', () => {
    expect(calculateZakat({ cash: 157500, ...RATES })).toMatchObject({ due: true, zakat: 3938 }); // 3,937.5 → 3,938
    expect(calculateZakat({ cash: 400000, bank: 80000, ...RATES }).zakat).toBe(12000);
  });

  it('takes debts off first and never goes below zero', () => {
    expect(calculateZakat({ cash: 500000, debts: 100000, ...RATES })).toMatchObject({ total: 500000, net: 400000, zakat: 10000 });
    expect(calculateZakat({ cash: 1000, debts: 5000, ...RATES })).toMatchObject({ net: 0, due: false, zakat: 0 });
  });

  it('values gold and silver by the tola in whole rupees', () => {
    const result = calculateZakat({ goldTola: 2.5, silverTola: 10.33, ...RATES });
    expect(result.goldValue).toBe(625000);
    expect(result.silverValue).toBe(30990);
    expect(result.total).toBe(655990);
  });

  it('uses the gold nisab when asked', () => {
    expect(calculateZakat({ cash: 1000000, nisabBasis: 'gold', ...RATES })).toMatchObject({ nisab: 1875000, due: false });
  });

  it('refuses without the price it needs', () => {
    expect(() => calculateZakat({ cash: 1000 })).toThrow(/silver price/);
    expect(() => calculateZakat({ goldTola: 1, silverPerTola: 3000 })).toThrow(/gold price/);
  });
});

describe('zakat API', () => {
  it('starts the form with goals, group balances and last year\'s savings', async () => {
    const azeem = await makeUser({ name: 'Azeem' });
    const sara = await makeUser({ name: 'Sara' });

    const goal = await request(app).post(`${api}/goals`).use(as(azeem)).send({ title: 'New laptop', targetAmount: 120000 });
    await request(app).post(`${api}/goals/${goal.body.data.goal.id}/contributions`).use(as(azeem)).send({ amount: 25000 });

    const group = await makeGroup(azeem, { memberEmails: [sara.email] });
    await request(app)
      .post(`${api}/groups/${group.id}/expenses`)
      .use(as(azeem))
      .send({ title: 'Hotel', totalAmount: 9000, category: 'Housing', splitType: 'EQUAL', paidBy: [{ userId: azeem.id, amount: 9000 }], participants: [azeem.id, sara.id] });

    await request(app).post(`${api}/transactions`).use(as(azeem)).send({ title: 'Salary', amount: 185000, type: 'CREDIT' });
    await request(app).post(`${api}/transactions`).use(as(azeem)).send({ title: 'Rent', amount: 45000 });

    const mine = await request(app).get(`${api}/zakat`).use(as(azeem));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({
      known: { goalsSaved: 25000, owedToYou: 4500, youOwe: 0, savedLast12Months: 140000 },
      rates: null,
      canEditRates: false,
    });

    const hers = await request(app).get(`${api}/zakat`).use(as(sara));
    expect(hers.body.data.known).toMatchObject({ owedToYou: 0, youOwe: 4500 });
  });

  it('lets only an app admin save the gold and silver prices, then calculates with them', async () => {
    process.env.ADMIN_EMAILS = 'boss@demo.pk';
    const boss = await makeUser({ email: 'boss@demo.pk' });
    const plain = await makeUser();

    const denied = await request(app).put(`${api}/zakat/rates`).use(as(plain)).send(RATES);
    expect(denied.status).toBe(403);

    const saved = await request(app).put(`${api}/zakat/rates`).use(as(boss)).send(RATES);
    expect(saved.status).toBe(200);
    expect(saved.body.data.rates).toMatchObject(RATES);
    expect((await request(app).get(`${api}/zakat`).use(as(boss))).body.data.canEditRates).toBe(true);

    const res = await request(app).post(`${api}/zakat/calculate`).use(as(plain)).send({ cash: 400000, bank: 80000 });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({ nisab: 157500, net: 480000, due: true, zakat: 12000 });

    // A price typed on the form wins over the saved one.
    const own = await request(app).post(`${api}/zakat/calculate`).use(as(plain)).send({ cash: 400000, silverPerTola: 10000 });
    expect(own.body.data.result).toMatchObject({ nisab: 525000, due: false, zakat: 0 });
  });

  it('fills the prices from the international rate, keeps the last copy when it is down', async () => {
    vi.restoreAllMocks();
    providersUp();
    const user = await makeUser();

    const live = await request(app).get(`${api}/zakat`).use(as(user));
    expect(live.body.data.rates).toMatchObject({ goldPerTola: 291600, silverPerTola: 2916, source: 'international', stale: false });
    expect(live.body.data.source.name).toBe('Gold API');

    const calc = await request(app).post(`${api}/zakat/calculate`).use(as(user)).send({ cash: 200000 });
    expect(calc.body.data.result).toMatchObject({ nisab: 153090, due: true, zakat: 5000 }); // 52.5 × 2,916

    vi.restoreAllMocks();
    clearRateCache();
    clearMetalCache();
    providersDown();
    const saved = await request(app).get(`${api}/zakat`).use(as(user));
    expect(saved.body.data.rates).toMatchObject({ goldPerTola: 291600, silverPerTola: 2916, source: 'international', stale: true });
  });

  it('uses an admin bazaar price while it is newer than the international one', async () => {
    vi.restoreAllMocks();
    providersUp();
    process.env.ADMIN_EMAILS = 'boss@demo.pk';
    const boss = await makeUser({ email: 'boss@demo.pk' });
    await request(app).get(`${api}/zakat`).use(as(boss)); // fetches the international price

    const saved = await request(app).put(`${api}/zakat/rates`).use(as(boss)).send({ goldPerTola: 300000, silverPerTola: 3200 });
    expect(saved.body.data.rates).toMatchObject({ goldPerTola: 300000, source: 'admin' });

    clearMetalCache(); // the next international refresh is newer, so it takes over again
    const later = await request(app).get(`${api}/zakat`).use(as(boss));
    expect(later.body.data.rates).toMatchObject({ goldPerTola: 291600, source: 'international' });
  });

  it('rejects bad input and a missing price', async () => {
    const user = await makeUser();
    const fraction = await request(app).post(`${api}/zakat/calculate`).use(as(user)).send({ cash: 10.5, silverPerTola: 3000 });
    expect(fraction.status).toBe(400);
    expect(fraction.body.error.code).toBe('VALIDATION_ERROR');

    const noRate = await request(app).post(`${api}/zakat/calculate`).use(as(user)).send({ cash: 1000 });
    expect(noRate.status).toBe(400);
    expect(noRate.body.error.code).toBe('ZAKAT_RATE_MISSING');
  });
});
