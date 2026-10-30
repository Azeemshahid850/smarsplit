import { describe, it, expect } from 'vitest';
import { convertToPkr } from '../services/currency.js';
import { computeSplits, SplitError } from '../services/splitCalculator.js';

const A = '0'.repeat(23) + 'a';
const B = '0'.repeat(23) + 'b';
const C = '0'.repeat(23) + 'c';
const AED = { currency: 'AED', rate: 75.37, rateDate: new Date('2026-10-30') };

const body = (overrides) => ({ totalAmount: 240, paidBy: [{ userId: A, amount: 240 }], splitType: 'EQUAL', participants: [A, B, C], exact: [], percentages: [], items: [], ...overrides });
const sum = (rows, key) => rows.reduce((runningTotal, row) => runningTotal + row[key], 0);

describe('convertToPkr', () => {
  it('converts the total and a single payer to whole rupees', () => {
    const { body: pkr, fx } = convertToPkr(body(), AED);
    expect(pkr.totalAmount).toBe(18089); // 240 × 75.37 = 18088.8
    expect(pkr.paidBy).toEqual([{ userId: A, amount: 18089 }]);
    expect(fx).toMatchObject({ currency: 'AED', rate: 75.37, totalAmount: 240, paidBy: [{ userId: A, amount: 240 }] });
  });

  it('lands the rounding drift on one payer so payers still cover the total', () => {
    const { body: pkr } = convertToPkr(body({ paidBy: [{ userId: A, amount: 80 }, { userId: B, amount: 80 }, { userId: C, amount: 80 }] }), AED);
    // each 80 × 75.37 = 6029.6 → 6030, three of them overshoot 18089 by one rupee
    expect(sum(pkr.paidBy, 'amount')).toBe(pkr.totalAmount);
    expect(pkr.paidBy.map((payerEntry) => payerEntry.amount)).toEqual([6029, 6030, 6030]);
    expect(pkr.paidBy.every((payerEntry) => Number.isInteger(payerEntry.amount))).toBe(true);
  });

  it('feeds an EQUAL split that balances to the rupee', () => {
    const { body: pkr } = convertToPkr(body(), AED);
    const splits = computeSplits(pkr);
    expect(sum(splits, 'share')).toBe(18089);
    expect(splits.find((splitEntry) => splitEntry.userId === A).share).toBe(6031); // payer takes the remainder
  });

  it('gives the exact-split drift to the payer', () => {
    const exact = [{ userId: A, share: 80 }, { userId: B, share: 80 }, { userId: C, share: 80 }];
    const { body: pkr, fx } = convertToPkr(body({ splitType: 'EXACT', participants: [], exact }), AED);
    expect(pkr.exact).toEqual([{ userId: A, share: 6029 }, { userId: B, share: 6030 }, { userId: C, share: 6030 }]);
    expect(sum(computeSplits(pkr), 'share')).toBe(pkr.totalAmount);
    expect(fx.exact).toEqual(exact);
  });

  it('converts line items so they still add up to the converted total', () => {
    const items = [
      { name: 'Shawarma', qty: 2, price: 40, sharedBy: [A, B] },
      { name: 'Juice', qty: 1, price: 80, sharedBy: [C] },
      { name: 'Dessert', qty: 1, price: 80, sharedBy: [A, B, C] },
    ];
    const { body: pkr, fx } = convertToPkr(body({ splitType: 'LINE_ITEM', participants: [], items }), AED);
    const splits = computeSplits(pkr);
    expect(sum(splits, 'share')).toBe(pkr.totalAmount);
    expect(splits.every((splitEntry) => Number.isInteger(splitEntry.share))).toBe(true);
    expect(fx.itemPrices).toEqual([40, 80, 80]);
  });

  it('reports a shortfall in the currency the user typed', () => {
    expect(() => convertToPkr(body({ paidBy: [{ userId: A, amount: 200 }] }), AED)).toThrow(new SplitError('Payers are AED 40 short'));
    expect(() =>
      convertToPkr(body({ splitType: 'EXACT', participants: [], exact: [{ userId: A, share: 100 }, { userId: B, share: 150.5 }] }), AED),
    ).toThrow(new SplitError('Shares are AED 10.5 over'));
  });

  it('keeps cents exact instead of trusting floating point', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it adds up.
    const { body: pkr } = convertToPkr(
      body({ totalAmount: 0.3, paidBy: [{ userId: A, amount: 0.1 }, { userId: B, amount: 0.2 }] }),
      { currency: 'KWD', rate: 905.12, rateDate: null },
    );
    expect(pkr.totalAmount).toBe(272);
    expect(sum(pkr.paidBy, 'amount')).toBe(272);
  });

  it('refuses a missing rate', () => {
    expect(() => convertToPkr(body(), { currency: 'AED', rate: undefined })).toThrow(SplitError);
  });
});
