// Turns a foreign-currency group expense into the integer-rupee shape the split
// calculator works in. Foreign amounts arrive with at most 2 decimals; every
// rupee field leaves as an integer and the rows still add up to the converted
// total: each row is rounded, then the rounding drift lands on one row — the
// payer's share for exact splits, otherwise the largest row — the same
// "remainder goes to the payer" rule the splits use.

import { SplitError, largestPayer } from './splitCalculator.js';

const cents = (amount) => Math.round(Number(amount) * 100);
const label = (currency, amountCents) =>
  `${currency} ${(amountCents / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

function assertAddsUp(rowCents, totalCents, currency, what) {
  const diff = totalCents - rowCents.reduce((runningTotal, value) => runningTotal + value, 0);
  if (diff === 0) return;
  throw new SplitError(diff > 0 ? `${what} are ${label(currency, diff)} short` : `${what} are ${label(currency, -diff)} over`);
}

const indexOfLargest = (values) => values.reduce((best, value, index) => (value > values[best] ? index : best), 0);

/** Rounds each foreign value to rupees, then moves the rounding drift onto row `target`. */
function toRupees(values, rate, totalRupees, target) {
  const rupees = values.map((value) => Math.round(value * rate));
  rupees[target] += totalRupees - rupees.reduce((runningTotal, value) => runningTotal + value, 0);
  return rupees;
}

/**
 * @param body   a validated expense body whose amounts are in `currency`
 * @param fxRate { currency, rate (rupees per unit), rateDate }
 * @returns {{ body, fx }} body in integer rupees, plus the original foreign figures
 */
export function convertToPkr(body, { currency, rate, rateDate }) {
  if (!(rate > 0)) throw new SplitError(`No exchange rate for ${currency}`);

  const totalCents = cents(body.totalAmount);
  const totalAmount = Math.round((totalCents / 100) * rate);
  if (totalAmount <= 0) throw new SplitError('Amount is too small to convert to rupees');

  const payerAmounts = body.paidBy.map((payerEntry) => payerEntry.amount);
  assertAddsUp(payerAmounts.map(cents), totalCents, currency, 'Payers');
  const payerRupees = toRupees(payerAmounts, rate, totalAmount, indexOfLargest(payerAmounts));
  if (payerRupees.some((amount) => amount <= 0)) throw new SplitError('Each payer must put in at least one rupee');
  const paidBy = body.paidBy.map((payerEntry, index) => ({ userId: payerEntry.userId, amount: payerRupees[index] }));

  let exact = [];
  if (body.splitType === 'EXACT' && body.exact.length) {
    const shares = body.exact.map((exactEntry) => exactEntry.share);
    assertAddsUp(shares.map(cents), totalCents, currency, 'Shares');
    const payerRow = body.exact.findIndex((exactEntry) => String(exactEntry.userId) === String(largestPayer(paidBy)));
    const shareRupees = toRupees(shares, rate, totalAmount, payerRow >= 0 ? payerRow : indexOfLargest(shares));
    if (shareRupees.some((share) => share < 0)) throw new SplitError('A share is too small to convert to rupees');
    exact = body.exact.map((exactEntry, index) => ({ userId: exactEntry.userId, share: shareRupees[index] }));
  }

  let items = body.items;
  if (body.splitType === 'LINE_ITEM' && body.items.length) {
    const lines = body.items.map((item) => item.price * (item.qty ?? 1));
    assertAddsUp(lines.map(cents), totalCents, currency, 'Line items');
    const lineRupees = toRupees(lines, rate, totalAmount, indexOfLargest(lines));
    // The calculator multiplies price by qty again, so store the per-unit rupee price.
    items = body.items.map((item, index) => ({ ...item, price: lineRupees[index] / (item.qty ?? 1) }));
  }

  return {
    body: { ...body, totalAmount, paidBy, exact, items },
    fx: {
      currency,
      rate,
      rateDate,
      totalAmount: totalCents / 100,
      paidBy: body.paidBy.map((payerEntry) => ({ userId: payerEntry.userId, amount: payerEntry.amount })),
      exact: body.splitType === 'EXACT' ? body.exact.map((exactEntry) => ({ userId: exactEntry.userId, share: exactEntry.share })) : [],
      itemPrices: body.splitType === 'LINE_ITEM' ? body.items.map((item) => item.price) : [],
    },
  };
}
