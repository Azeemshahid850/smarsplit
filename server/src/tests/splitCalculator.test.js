import { describe, it, expect } from 'vitest';
import {
  computeSplits,
  assertPayersCoverTotal,
  assertSplitsBalance,
  largestPayer,
  SplitError,
} from '../services/splitCalculator.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccc';
const total = (splits) => splits.reduce((runningTotal, splitEntry) => runningTotal + splitEntry.share, 0);

describe('EQUAL', () => {
  it('splits evenly when it divides', () => {
    const splits = computeSplits({ splitType: 'EQUAL', totalAmount: 900, participants: [A, B, C], paidBy: [{ userId: A, amount: 900 }] });
    expect(splits).toEqual([
      { userId: A, share: 300 },
      { userId: B, share: 300 },
      { userId: C, share: 300 },
    ]);
  });

  it('gives the uneven remainder to the payer (100 over 3)', () => {
    const splits = computeSplits({ splitType: 'EQUAL', totalAmount: 100, participants: [A, B, C], paidBy: [{ userId: B, amount: 100 }] });

    expect(total(splits)).toBe(100);
    expect(splits.find((splitEntry) => splitEntry.userId === B).share).toBe(34);
    expect(splits.filter((splitEntry) => splitEntry.userId !== B).map((splitEntry) => splitEntry.share)).toEqual([33, 33]);
  });

  it('falls back to the first participant when the payer is not splitting', () => {
    const splits = computeSplits({ splitType: 'EQUAL', totalAmount: 100, participants: [A, B, C], paidBy: [{ userId: 'zzzzzzzzzzzzzzzzzzzzzzzz', amount: 100 }] });

    expect(total(splits)).toBe(100);
    expect(splits[0].share).toBe(34);
  });

  it('handles a single participant and a 1-rupee total', () => {
    expect(computeSplits({ splitType: 'EQUAL', totalAmount: 1, participants: [A], paidBy: [{ userId: A, amount: 1 }] })).toEqual([
      { userId: A, share: 1 },
    ]);
  });

  it('always balances for awkward totals', () => {
    for (const amount of [1, 7, 99, 100, 101, 4201, 99999]) {
      for (const people of [[A], [A, B], [A, B, C]]) {
        const splits = computeSplits({ splitType: 'EQUAL', totalAmount: amount, participants: people, paidBy: [{ userId: A, amount }] });
        expect(total(splits)).toBe(amount);
      }
    }
  });

  it('rejects a non-integer or zero total', () => {
    expect(() => computeSplits({ splitType: 'EQUAL', totalAmount: 100.5, participants: [A] })).toThrow(SplitError);
    expect(() => computeSplits({ splitType: 'EQUAL', totalAmount: 0, participants: [A] })).toThrow(SplitError);
  });
});

describe('EXACT', () => {
  it('accepts amounts that sum to the total', () => {
    const splits = computeSplits({
      splitType: 'EXACT',
      totalAmount: 1000,
      exact: [{ userId: A, share: 600 }, { userId: B, share: 400 }],
    });
    expect(total(splits)).toBe(1000);
  });

  it('says how far short you are', () => {
    expect(() =>
      computeSplits({ splitType: 'EXACT', totalAmount: 1000, exact: [{ userId: A, share: 600 }, { userId: B, share: 350 }] }),
    ).toThrow("You're Rs 50 short");
  });

  it('says how far over you are', () => {
    expect(() =>
      computeSplits({ splitType: 'EXACT', totalAmount: 1000, exact: [{ userId: A, share: 900 }, { userId: B, share: 350 }] }),
    ).toThrow("You're Rs 250 over");
  });
});

describe('PERCENTAGE', () => {
  it('converts percentages and gives rounding loss to the payer', () => {
    const splits = computeSplits({
      splitType: 'PERCENTAGE',
      totalAmount: 100,
      percentages: [{ userId: A, percent: 33.33 }, { userId: B, percent: 33.33 }, { userId: C, percent: 33.34 }],
      paidBy: [{ userId: C, amount: 100 }],
    });

    expect(total(splits)).toBe(100);
    expect(splits.find((splitEntry) => splitEntry.userId === C).share).toBe(34);
  });

  it('handles thirds of an awkward total', () => {
    const splits = computeSplits({
      splitType: 'PERCENTAGE',
      totalAmount: 4201,
      percentages: [{ userId: A, percent: 50 }, { userId: B, percent: 25 }, { userId: C, percent: 25 }],
      paidBy: [{ userId: A, amount: 4201 }],
    });

    expect(total(splits)).toBe(4201);
    expect(splits.map((splitEntry) => splitEntry.share)).toEqual([2101, 1050, 1050]);
  });

  it('rejects percentages that do not reach 100', () => {
    expect(() =>
      computeSplits({ splitType: 'PERCENTAGE', totalAmount: 100, percentages: [{ userId: A, percent: 60 }, { userId: B, percent: 30 }] }),
    ).toThrow('add up to 90%');
  });
});

describe('LINE_ITEM', () => {
  it('divides each item among the people who shared it', () => {
    const splits = computeSplits({
      splitType: 'LINE_ITEM',
      totalAmount: 900,
      items: [
        { name: 'Biryani', qty: 2, price: 300, sharedBy: [A, B] }, // 600 → 300 each
        { name: 'Juice', qty: 1, price: 300, sharedBy: [C] },
      ],
      paidBy: [{ userId: A, amount: 900 }],
    });

    expect(total(splits)).toBe(900);
    expect(Object.fromEntries(splits.map((splitEntry) => [splitEntry.userId, splitEntry.share]))).toEqual({ [A]: 300, [B]: 300, [C]: 300 });
  });

  it('rounds an item that does not divide evenly and still balances', () => {
    const splits = computeSplits({
      splitType: 'LINE_ITEM',
      totalAmount: 100,
      items: [{ name: 'Chai', qty: 1, price: 100, sharedBy: [A, B, C] }],
      paidBy: [{ userId: A, amount: 100 }],
    });

    expect(total(splits)).toBe(100);
    expect(splits.map((splitEntry) => splitEntry.share).sort()).toEqual([33, 33, 34]);
  });

  it('rejects items that do not add up to the expense total', () => {
    expect(() =>
      computeSplits({
        splitType: 'LINE_ITEM',
        totalAmount: 1000,
        items: [{ name: 'Chai', qty: 1, price: 400, sharedBy: [A] }],
        paidBy: [{ userId: A, amount: 1000 }],
      }),
    ).toThrow('Line items add up to Rs 400');
  });

  it('rejects an item nobody shares', () => {
    expect(() =>
      computeSplits({ splitType: 'LINE_ITEM', totalAmount: 100, items: [{ name: 'Chai', qty: 1, price: 100, sharedBy: [] }] }),
    ).toThrow('Pick who shares "Chai"');
  });
});

describe('multi-payer invariants', () => {
  it('accepts payers that cover the total exactly', () => {
    expect(() => assertPayersCoverTotal([{ userId: A, amount: 3000 }, { userId: B, amount: 1500 }], 4500)).not.toThrow();
  });

  it('reports the shortfall in rupees', () => {
    expect(() => assertPayersCoverTotal([{ userId: A, amount: 3000 }], 4500)).toThrow('Rs 1,500 short');
  });

  it('reports an overpayment', () => {
    expect(() => assertPayersCoverTotal([{ userId: A, amount: 5000 }], 4500)).toThrow('Rs 500 over');
  });

  it('picks the largest payer for the rounding remainder', () => {
    expect(largestPayer([{ userId: A, amount: 1000 }, { userId: B, amount: 2500 }, { userId: C, amount: 500 }])).toBe(B);
  });

  it('rejects a zero or fractional payer amount', () => {
    expect(() => assertPayersCoverTotal([{ userId: A, amount: 0 }], 0)).toThrow(SplitError);
    expect(() => assertPayersCoverTotal([{ userId: A, amount: 10.5 }], 10.5)).toThrow(SplitError);
  });

  it('assertSplitsBalance catches a broken split set', () => {
    expect(() => assertSplitsBalance([{ userId: A, share: 99 }], 100)).toThrow('Splits add up to Rs 99');
  });
});
