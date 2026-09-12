// Pure money math for group expenses. Every amount is an INTEGER number of
// rupees — no floats survive past percentage conversion.
//
// One rounding rule for every method: shares floor down, and the whole leftover
// goes to the payer (the largest one when an expense has several). That keeps
// sum(splits.share) === totalAmount, which the model then enforces.

export class SplitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SplitError';
  }
}

const isInt = (headCount) => Number.isInteger(headCount);
const sum = (arrangement, key) => arrangement.reduce((runningTotal, entry) => runningTotal + (key ? entry[key] : entry), 0);

/** The payer who put in the most — the leftover rupees land on them. */
export function largestPayer(paidBy = []) {
  if (!paidBy.length) return null;
  return paidBy.reduce((best, payerEntry) => (payerEntry.amount > best.amount ? payerEntry : best)).userId;
}

/** Spreads `total` over `userIds`, floor each, leftover to `preferredUserId`. */
function distribute(total, userIds, preferredUserId) {
  const headCount = userIds.length;
  const base = Math.floor(total / headCount);
  const shares = new Map(userIds.map((id) => [String(id), base]));

  const leftover = total - base * headCount;
  if (leftover > 0) {
    const target =
      preferredUserId && shares.has(String(preferredUserId)) ? String(preferredUserId) : String(userIds[0]);
    shares.set(target, shares.get(target) + leftover);
  }
  return shares;
}

const toSplits = (shares) => [...shares].map(([userId, share]) => ({ userId, share }));

/**
 * @returns {{userId: string, share: number}[]} shares summing exactly to totalAmount
 */
export function computeSplits({ splitType, totalAmount, participants = [], exact = [], percentages = [], items = [], paidBy = [] }) {
  if (!isInt(totalAmount) || totalAmount <= 0) throw new SplitError('Total must be a whole number of rupees above zero');

  const payer = largestPayer(paidBy);

  switch (splitType) {
    case 'EQUAL': {
      if (!participants.length) throw new SplitError('Pick at least one person to split with');
      return toSplits(distribute(totalAmount, participants, payer));
    }

    case 'EXACT': {
      if (!exact.length) throw new SplitError('Enter an amount for at least one person');
      if (exact.some((exactEntry) => !isInt(exactEntry.share) || exactEntry.share < 0)) throw new SplitError('Amounts must be whole rupees');

      const given = sum(exact, 'share');
      if (given !== totalAmount) {
        const diff = totalAmount - given;
        throw new SplitError(
          diff > 0 ? `You're Rs ${diff.toLocaleString('en-PK')} short` : `You're Rs ${(-diff).toLocaleString('en-PK')} over`,
        );
      }
      return exact.map((exactEntry) => ({ userId: String(exactEntry.userId), share: exactEntry.share }));
    }

    case 'PERCENTAGE': {
      if (!percentages.length) throw new SplitError('Enter a percentage for at least one person');

      const totalPct = Math.round(sum(percentages, 'percent') * 100) / 100;
      if (totalPct !== 100) throw new SplitError(`Percentages add up to ${totalPct}%, not 100%`);

      const shares = new Map(
        percentages.map((payerEntry) => [String(payerEntry.userId), Math.floor((totalAmount * payerEntry.percent) / 100)]),
      );
      const leftover = totalAmount - sum([...shares.values()]);
      if (leftover > 0) {
        const target = payer && shares.has(String(payer)) ? String(payer) : String(percentages[0].userId);
        shares.set(target, shares.get(target) + leftover);
      }
      return toSplits(shares);
    }

    case 'LINE_ITEM': {
      if (!items.length) throw new SplitError('Add at least one line item');

      const shares = new Map();
      let allocated = 0;

      for (const item of items) {
        const qty = item.qty ?? 1;
        const lineTotal = Math.round(item.price * qty);
        if (!isInt(lineTotal) || lineTotal < 0) throw new SplitError(`"${item.name}" has an invalid price`);
        if (!item.sharedBy?.length) throw new SplitError(`Pick who shares "${item.name}"`);

        for (const [userId, share] of distribute(lineTotal, item.sharedBy)) {
          shares.set(userId, (shares.get(userId) || 0) + share);
        }
        allocated += lineTotal;
      }

      if (allocated !== totalAmount) {
        throw new SplitError(
          `Line items add up to Rs ${allocated.toLocaleString('en-PK')}, but the total is Rs ${totalAmount.toLocaleString('en-PK')}`,
        );
      }
      return toSplits(shares);
    }

    default:
      throw new SplitError(`Unknown split type ${splitType}`);
  }
}

/** sum(paidBy.amount) must equal the expense total. */
export function assertPayersCoverTotal(paidBy, totalAmount) {
  if (!paidBy?.length) throw new SplitError('At least one payer is required');
  if (paidBy.some((payerEntry) => !isInt(payerEntry.amount) || payerEntry.amount <= 0)) throw new SplitError('Each payer must put in whole rupees above zero');

  const covered = sum(paidBy, 'amount');
  if (covered !== totalAmount) {
    const diff = totalAmount - covered;
    throw new SplitError(
      diff > 0
        ? `Payers cover Rs ${covered.toLocaleString('en-PK')} of Rs ${totalAmount.toLocaleString('en-PK')} — Rs ${diff.toLocaleString('en-PK')} short`
        : `Payers cover Rs ${covered.toLocaleString('en-PK')}, which is Rs ${(-diff).toLocaleString('en-PK')} over the total`,
    );
  }
}

/** The invariant the whole app rests on. */
export function assertSplitsBalance(splits, totalAmount) {
  const allocated = sum(splits, 'share');
  if (allocated !== totalAmount) {
    throw new SplitError(`Splits add up to Rs ${allocated.toLocaleString('en-PK')}, not Rs ${totalAmount.toLocaleString('en-PK')}`);
  }
}
