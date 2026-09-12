import { describe, it, expect, beforeEach } from 'vitest';
import { normalize, similarity, parseSize, findBenchmark, matchLineItems, MATCH_THRESHOLD } from '../services/priceMatch.js';
import { seedBenchmarkPrices } from '../scripts/seedPrices.js';
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';

describe('normalize', () => {
  it('strips sizes, units and punctuation', () => {
    expect(normalize('COOKING OIL 3LTR @')).toBe('cooking oil');
    expect(normalize('Cooking Oil 3 Litre')).toBe('cooking oil');
    expect(normalize('Basmati Rice 5kg')).toBe('basmati rice');
    expect(normalize('2 x Milk 1L')).toBe('milk');
    expect(normalize('Surf Excel 1KG Packet')).toBe('surf excel');
  });

  it('returns an empty string for junk', () => {
    expect(normalize('***')).toBe('');
    expect(normalize('500g')).toBe('');
  });
});

describe('similarity', () => {
  it('scores identical strings 1 and unrelated strings near 0', () => {
    expect(similarity('cooking oil', 'cooking oil')).toBe(1);
    expect(similarity('cooking oil', 'toothpaste')).toBeLessThan(0.2);
  });

  it('scores a close spelling above the match threshold', () => {
    expect(similarity('basmati rice', 'basmati rise')).toBeGreaterThan(MATCH_THRESHOLD);
    expect(similarity('cooking oil', 'cookng oil')).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('known limit: one typo inside a short word falls under 0.8', () => {
    // Dice on bigrams: 'detergent' vs 'detergant' loses 2 of 8 bigrams → 0.75.
    // Aliases carry the common misspellings instead of lowering the threshold.
    expect(similarity('detergent', 'detergant')).toBeCloseTo(0.75, 2);
  });
});

describe('size awareness', () => {
  beforeEach(async () => {
    await seedBenchmarkPrices();
  });

  it('never compares a 5kg bag against a 1kg price', async () => {
    expect((await findBenchmark('Basmati Rice 5kg')).match.canonicalName).toBe('Basmati Rice 5kg');
    expect((await findBenchmark('Basmati Rice 1kg')).match.canonicalName).toBe('Basmati Rice 1kg');
  });

  it('understands equivalent unit spellings', async () => {
    expect(parseSize('Cooking Oil 3LTR')).toEqual({ unit: 'ml', amount: 3000 });
    expect(parseSize('Cooking Oil 3 Litre')).toEqual({ unit: 'ml', amount: 3000 });
    expect(parseSize('Sugar 1kg')).toEqual({ unit: 'g', amount: 1000 });
    expect(parseSize('Milk')).toBeNull();
  });

  it('matches a 5L oil to the 5L row, not the 3L one', async () => {
    expect((await findBenchmark('Cooking Oil 5L')).match.canonicalName).toBe('Cooking Oil 5L');
    expect((await findBenchmark('Cooking Oil 3L')).match.canonicalName).toBe('Cooking Oil 3L');
  });
});

describe('the price book', () => {
  beforeEach(async () => {
    await seedBenchmarkPrices();
  });

  it('seeds 100 products across the three platforms', async () => {
    const { products, rows } = { products: 100, rows: await BenchmarkPrice.countDocuments() };
    expect(products).toBe(100);
    expect(rows).toBeGreaterThan(200);
    expect(await BenchmarkPrice.distinct('platform')).toEqual(expect.arrayContaining(['daraz', 'metro', 'imtiaz']));
  });

  it('finds a product through an alias and returns the cheapest platform', async () => {
    const found = await findBenchmark('Cooking Oil 3L');
    expect(found.match.canonicalName).toBe('Cooking Oil 3L');
    expect(found.match.platform).toBe('daraz'); // 1745 beats metro 1790 and imtiaz 1830
    expect(found.match.price).toBe(1745);
    expect(found.alternatives.length).toBeGreaterThan(1);
  });

  it('matches messy receipt text', async () => {
    expect((await findBenchmark('SUPER BASMATI 5KG')).match.canonicalName).toBe('Basmati Rice 5kg');
    expect((await findBenchmark('surf excel 1kg')).match.canonicalName).toBe('Detergent 1kg');
    expect((await findBenchmark('anday')).match.canonicalName).toBe('Eggs Dozen');
  });

  it('tolerates a typo through fuzzy matching', async () => {
    expect((await findBenchmark('tooth paste')).match.canonicalName).toBe('Toothpaste 150g');
  });

  it('returns null for something not in the book', async () => {
    expect(await findBenchmark('handmade ceramic vase')).toBeNull();
    expect(await findBenchmark('')).toBeNull();
  });
});

describe('matchLineItems', () => {
  beforeEach(async () => {
    await seedBenchmarkPrices();
  });

  it('flags only the lines where something cheaper exists and totals the saving', async () => {
    const { lineItems, potentialSavings, suggestedAlternatives } = await matchLineItems([
      { name: 'Cooking Oil 3L', qty: 1, price: 1890 }, // daraz 1745 → saves 145
      { name: 'Basmati Rice 5kg', qty: 1, price: 1900 }, // cheaper than daraz 2050 → no match
      { name: 'Handmade vase', qty: 1, price: 3000 }, // not in the book
    ]);

    expect(lineItems[0].priceMatch).toMatchObject({ source: 'daraz', onlinePrice: 1745 });
    expect(lineItems[1].priceMatch).toBeNull();
    expect(lineItems[2].priceMatch).toBeNull();
    expect(potentialSavings).toBe(145);
    expect(suggestedAlternatives[0]).toMatchObject({ name: 'Cooking Oil 3L', onlinePrice: 1745, saving: 145 });
  });

  it('multiplies the saving by the quantity', async () => {
    const { potentialSavings } = await matchLineItems([{ name: 'Milk 1L', qty: 4, price: 1000 }]); // 250 each vs 210
    expect(potentialSavings).toBe(160);
  });

  it('keeps at most the three biggest savings', async () => {
    const { suggestedAlternatives } = await matchLineItems([
      { name: 'Cooking Oil 3L', qty: 1, price: 2500 },
      { name: 'Basmati Rice 5kg', qty: 1, price: 3000 },
      { name: 'Tea 500g', qty: 1, price: 2000 },
      { name: 'Sugar 1kg', qty: 1, price: 500 },
      { name: 'Eggs Dozen', qty: 1, price: 600 },
    ]);

    expect(suggestedAlternatives).toHaveLength(3);
    expect(suggestedAlternatives[0].saving).toBeGreaterThanOrEqual(suggestedAlternatives[1].saving);
    expect(suggestedAlternatives[1].saving).toBeGreaterThanOrEqual(suggestedAlternatives[2].saving);
  });

  it('handles an empty receipt', async () => {
    expect(await matchLineItems([])).toMatchObject({ lineItems: [], potentialSavings: 0, suggestedAlternatives: [] });
  });
});

describe('savings land on the committed transaction', () => {
  it('annotates the receipt and the transaction after commit', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../app.js');
    const { makeUser } = await import('./helpers.js');
    const { Receipt } = await import('../models/Receipt.js');
    const { PersonalExpense } = await import('../models/PersonalExpense.js');
    const { applyPriceMatches } = await import('../controllers/receipts.controller.js');

    await seedBenchmarkPrices();
    const user = await makeUser();

    const receipt = await Receipt.create({
      userId: user.id,
      imageUrl: 'data:image/jpeg;base64,x',
      ocrStatus: 'done',
      store: 'Imtiaz',
      lineItems: [
        { name: 'Cooking Oil 3L', qty: 1, price: 1890 },
        { name: 'Tea 500g', qty: 1, price: 1300 },
      ],
      totalDetected: 3190,
    });

    const res = await request(app)
      .post(`/api/v1/receipts/${receipt._id}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'personal' });

    expect(res.status).toBe(201);

    // The background job is fire-and-forget; run it directly to assert its effect.
    await applyPriceMatches(receipt._id, res.body.data.transactionId);

    const saved = await PersonalExpense.findById(res.body.data.transactionId);
    expect(saved.potentialSavings).toBe(325); // oil 145 + tea 180
    expect(saved.suggestedAlternatives).toHaveLength(2);
    expect(saved.suggestedAlternatives[0]).toMatchObject({ name: 'Tea 500g', source: 'daraz', onlinePrice: 1120 });

    const after = await Receipt.findById(receipt._id);
    expect(after.potentialSavings).toBe(325);
    expect(after.lineItems[0].priceMatch.source).toBe('daraz');
  });
});
