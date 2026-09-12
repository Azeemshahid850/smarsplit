import { describe, it, expect } from 'vitest';
import { computeNetBalances, minCashFlow, rawPairwiseDebts, settlementPreview } from '../services/settlement.js';
import { computeSplits } from '../services/splitCalculator.js';

const apply = (net, payments) => {
  const after = new Map(net);
  for (const payment of payments) {
    after.set(payment.from, (after.get(payment.from) || 0) + payment.amount);
    after.set(payment.to, (after.get(payment.to) || 0) - payment.amount);
  }
  return after;
};

const allZero = (balances) => [...balances.values()].every((netValue) => netValue === 0);

describe('minCashFlow — the guarantees', () => {
  it('settles the Murree example in exactly 4 payments', () => {
    const net = new Map([
      ['Sara', 7080],
      ['Bilal', 4330],
      ['Azeem', 1080],
      ['Hamza', -6020],
      ['Ali', -6470],
    ]);

    const payments = minCashFlow(net);

    expect(payments).toHaveLength(4);
    expect(payments.length).toBeLessThanOrEqual(net.size - 1);
    expect(allZero(apply(net, payments))).toBe(true);
    expect(payments.every((payment) => payment.amount > 0)).toBe(true);
    // Nobody both pays and receives in the optimized set.
    const payers = new Set(payments.map((payment) => payment.from));
    expect(payments.some((payment) => payers.has(payment.to))).toBe(false);
  });

  it('returns nothing for an already-settled group', () => {
    expect(minCashFlow(new Map([['a', 0], ['b', 0], ['c', 0]]))).toEqual([]);
    expect(minCashFlow(new Map())).toEqual([]);
  });

  it('settles the simplest case with one payment', () => {
    const net = new Map([['a', 500], ['b', -500]]);
    expect(minCashFlow(net)).toEqual([{ from: 'b', to: 'a', amount: 500 }]);
  });

  it('handles the rounding leftovers real splits produce', () => {
    // 100 over 3, payer keeps the extra rupee: +66 / −33 / −33.
    const net = new Map([['payer', 66], ['b', -33], ['c', -33]]);
    const payments = minCashFlow(net);

    expect(payments).toHaveLength(2);
    expect(payments.reduce((runningTotal, payment) => runningTotal + payment.amount, 0)).toBe(66);
    expect(allZero(apply(net, payments))).toBe(true);
  });

  it('refuses balances that do not net to zero', () => {
    expect(() => minCashFlow(new Map([['a', 100], ['b', -50]]))).toThrow('do not net to zero');
  });

  it('property: random groups of 2..10 always settle to zero in at most V−1 payments', () => {
    let seed = 12345;
    const rand = (max) => {
      seed = (seed * 1103515245 + 12345) % 2147483648; // deterministic LCG, reproducible failures
      return Math.floor((seed / 2147483648) * max);
    };

    for (let round = 0; round < 300; round += 1) {
      const size = 2 + rand(9);
      const members = Array.from({ length: size }, (_, i) => `u${i}`);

      // Build real expenses through the real split calculator.
      const expenses = [];
      for (let e = 0; e < 1 + rand(6); e += 1) {
        const totalAmount = 1 + rand(20000);
        const payer = members[rand(size)];
        const participants = members.filter(() => rand(2) === 0);
        if (!participants.length) participants.push(members[rand(size)]);

        const paidBy = [{ userId: payer, amount: totalAmount }];
        expenses.push({
          totalAmount,
          paidBy,
          splits: computeSplits({ splitType: 'EQUAL', totalAmount, participants, paidBy }),
        });
      }

      const net = computeNetBalances(expenses, []);
      const payments = minCashFlow(net);

      expect(payments.length).toBeLessThanOrEqual(size - 1);
      expect(allZero(apply(net, payments))).toBe(true);
      expect(payments.every((payment) => Number.isInteger(payment.amount) && payment.amount > 0)).toBe(true);
    }
  });

  it('property: multi-payer expenses settle just as cleanly', () => {
    let seed = 99;
    const rand = (max) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * max);
    };

    for (let round = 0; round < 100; round += 1) {
      const size = 3 + rand(8);
      const members = Array.from({ length: size }, (_, i) => `u${i}`);
      const totalAmount = 2 + rand(50000);

      const first = 1 + rand(totalAmount - 1);
      const paidBy = [
        { userId: members[rand(size)], amount: first },
        { userId: members[rand(size)], amount: totalAmount - first },
      ].filter((payment) => payment.amount > 0);

      const expenses = [
        { totalAmount, paidBy, splits: computeSplits({ splitType: 'EQUAL', totalAmount, participants: members, paidBy }) },
      ];

      const net = computeNetBalances(expenses, []);
      expect([...net.values()].reduce((runningTotal, netValue) => runningTotal + netValue, 0)).toBe(0);
      expect(allZero(apply(net, minCashFlow(net)))).toBe(true);
    }
  });
});

describe('computeNetBalances', () => {
  it('nets paid against owed', () => {
    const net = computeNetBalances([
      { totalAmount: 900, paidBy: [{ userId: 'a', amount: 900 }], splits: [{ userId: 'a', share: 300 }, { userId: 'b', share: 300 }, { userId: 'c', share: 300 }] },
    ]);

    expect(Object.fromEntries(net)).toEqual({ a: 600, b: -300, c: -300 });
  });

  it('ignores soft-deleted expenses', () => {
    const net = computeNetBalances([
      { deletedAt: new Date(), totalAmount: 900, paidBy: [{ userId: 'a', amount: 900 }], splits: [{ userId: 'b', share: 900 }] },
    ]);
    expect(net.size).toBe(0);
  });

  it('counts a paid settlement and ignores an unpaid one', () => {
    const expenses = [{ totalAmount: 1000, paidBy: [{ userId: 'a', amount: 1000 }], splits: [{ userId: 'a', share: 500 }, { userId: 'b', share: 500 }] }];

    const unpaid = computeNetBalances(expenses, [{ fromUser: 'b', toUser: 'a', amount: 500, isPaid: false }]);
    expect(Object.fromEntries(unpaid)).toEqual({ a: 500, b: -500 });

    const paid = computeNetBalances(expenses, [{ fromUser: 'b', toUser: 'a', amount: 500, isPaid: true }]);
    expect(Object.fromEntries(paid)).toEqual({ a: 0, b: 0 });
  });
});

describe('rawPairwiseDebts and the saving', () => {
  it('counts every naive debt, then shows what optimisation removes', () => {
    // Three expenses, each paid by a different person, split three ways.
    const members = ['a', 'b', 'c'];
    const expenses = members.map((payer) => {
      const paidBy = [{ userId: payer, amount: 900 }];
      return { totalAmount: 900, paidBy, splits: computeSplits({ splitType: 'EQUAL', totalAmount: 900, participants: members, paidBy }) };
    });

    expect(rawPairwiseDebts(expenses)).toHaveLength(6); // everyone owes both others

    const preview = settlementPreview(expenses, []);
    expect(preview.rawDebtCount).toBe(6);
    expect(preview.optimizedCount).toBe(0); // perfectly symmetric — nothing left to move
    expect(preview.transfersSaved).toBe(6);
  });

  it('reports the 6 → 2 style saving on a lopsided group', () => {
    const members = ['a', 'b', 'c', 'd'];
    const paidBy = [{ userId: 'a', amount: 4000 }];
    const expenses = [
      { totalAmount: 4000, paidBy, splits: computeSplits({ splitType: 'EQUAL', totalAmount: 4000, participants: members, paidBy }) },
      {
        totalAmount: 300,
        paidBy: [{ userId: 'b', amount: 300 }],
        splits: computeSplits({ splitType: 'EQUAL', totalAmount: 300, participants: members, paidBy: [{ userId: 'b', amount: 300 }] }),
      },
    ];

    const preview = settlementPreview(expenses, []);
    expect(preview.rawDebtCount).toBeGreaterThan(preview.optimizedCount);
    expect(preview.transfersSaved).toBe(preview.rawDebtCount - preview.optimizedCount);
    expect(preview.optimizedCount).toBeLessThanOrEqual(members.length - 1);
  });
});
