// Min-Cash-Flow debt settlement.
//
// Everyone's net position is computed first (paid − owed). Then the greedy
// max-matching repeatedly pairs the biggest creditor with the biggest debtor and
// moves min(|debt|, credit) between them. Each pass zeroes at least one person,
// so a group of V members needs at most V−1 payments — the guarantee the whole
// feature is sold on.
//
// All amounts are integer rupees, so no residue can hide in a float.

/**
 * Net position per user from raw expense + settlement documents.
 * Kept pure (no Mongoose) so it can be tested and reasoned about directly;
 * `services/balances.js` computes the same thing in the database for live routes.
 * @returns {Map<string, number>} userId → net (positive = is owed)
 */
export function computeNetBalances(expenses = [], settlements = []) {
  const net = new Map();
  const bump = (id, delta) => net.set(String(id), (net.get(String(id)) || 0) + delta);

  for (const e of expenses) {
    if (e.deletedAt) continue;
    for (const p of e.paidBy) bump(p.userId, p.amount);
    for (const s of e.splits) bump(s.userId, -s.share);
  }

  // A settlement that has actually been paid cancels that much of the debt.
  for (const s of settlements) {
    if (!s.isPaid) continue;
    bump(s.fromUser, s.amount);
    bump(s.toUser, -s.amount);
  }

  return net;
}

/**
 * @param {Map<string, number>|Record<string, number>} netBalances
 * @returns {{from: string, to: string, amount: number}[]} at most V−1 payments
 */
export function minCashFlow(netBalances) {
  const entries = netBalances instanceof Map ? [...netBalances] : Object.entries(netBalances);

  const creditors = entries.filter(([, net]) => net > 0).map(([userId, net]) => ({ userId, net }));
  const debtors = entries.filter(([, net]) => net < 0).map(([userId, net]) => ({ userId, net: -net }));

  const totalCredit = creditors.reduce((t, c) => t + c.net, 0);
  const totalDebt = debtors.reduce((t, d) => t + d.net, 0);
  if (totalCredit !== totalDebt) {
    throw new Error(`Balances do not net to zero: owed ${totalCredit}, owing ${totalDebt}`);
  }

  const payments = [];
  // ponytail: re-sorting beats a real heap below ~1k members; swap in a binary
  // heap only if a group ever gets that large.
  const byLargest = (a, b) => b.net - a.net || (a.userId < b.userId ? -1 : 1);

  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);

    const creditor = creditors[0];
    const debtor = debtors[0];
    const amount = Math.min(creditor.net, debtor.net);

    payments.push({ from: debtor.userId, to: creditor.userId, amount });

    creditor.net -= amount;
    debtor.net -= amount;

    // At least one of the two is now square and leaves the pool.
    if (creditor.net === 0) creditors.shift();
    if (debtor.net === 0) debtors.shift();
  }

  return payments;
}

/**
 * Every pairwise debt before optimisation — what the naive "everyone pays
 * everyone back" approach would need. Used for the "6 → 2 payments" stat.
 */
export function rawPairwiseDebts(expenses = []) {
  const owed = new Map(); // "debtor|creditor" → rupees

  for (const e of expenses) {
    if (e.deletedAt) continue;
    const total = e.totalAmount ?? e.paidBy.reduce((t, p) => t + p.amount, 0);

    for (const split of e.splits) {
      for (const payer of e.paidBy) {
        if (String(split.userId) === String(payer.userId)) continue;
        // Each payer funded payer.amount/total of this expense.
        const portion = Math.round((split.share * payer.amount) / total);
        if (portion <= 0) continue;
        const key = `${split.userId}|${payer.userId}`;
        owed.set(key, (owed.get(key) || 0) + portion);
      }
    }
  }

  return [...owed]
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => {
      const [from, to] = key.split('|');
      return { from, to, amount };
    });
}

/** Preview payload: raw debt count, optimized payments, transfers saved. */
export function settlementPreview(expenses, settlements) {
  const net = computeNetBalances(expenses, settlements);
  const payments = minCashFlow(net);
  const rawDebts = rawPairwiseDebts(expenses);

  return {
    payments,
    rawDebtCount: rawDebts.length,
    optimizedCount: payments.length,
    transfersSaved: Math.max(rawDebts.length - payments.length, 0),
    rawDebts,
  };
}
