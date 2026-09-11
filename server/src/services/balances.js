import mongoose from 'mongoose';
import { GroupExpense } from '../models/GroupExpense.js';
import { Settlement } from '../models/Settlement.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Net position per member, always recomputed from expenses (+ recorded
 * settlements) — never read from a stored running total.
 * net > 0 → the group owes them; net < 0 → they owe the group.
 */
export async function groupBalances(groupId) {
  const [facets] = await GroupExpense.aggregate([
    { $match: { groupId: oid(groupId), deletedAt: null } },
    {
      $facet: {
        paid: [{ $unwind: '$paidBy' }, { $group: { _id: '$paidBy.userId', amount: { $sum: '$paidBy.amount' } } }],
        owed: [{ $unwind: '$splits' }, { $group: { _id: '$splits.userId', amount: { $sum: '$splits.share' } } }],
        totals: [{ $group: { _id: null, totalSpent: { $sum: '$totalAmount' }, count: { $sum: 1 } } }],
      },
    },
  ]);

  // A paid settlement moves money for real, so it cancels that much of the debt.
  const settlements = await Settlement.aggregate([
    { $match: { groupId: oid(groupId), isPaid: true } },
    {
      $facet: {
        out: [{ $group: { _id: '$fromUser', amount: { $sum: '$amount' } } }],
        in: [{ $group: { _id: '$toUser', amount: { $sum: '$amount' } } }],
      },
    },
  ]).then(([r]) => r ?? { out: [], in: [] });

  const net = new Map();
  const bump = (id, delta) => net.set(String(id), (net.get(String(id)) || 0) + delta);

  facets.paid.forEach((r) => bump(r._id, r.amount));
  facets.owed.forEach((r) => bump(r._id, -r.amount));
  settlements.out.forEach((r) => bump(r._id, r.amount)); // paying down what you owe lifts your net
  settlements.in.forEach((r) => bump(r._id, -r.amount));

  return {
    net, // Map<userId, integer rupees>
    totalSpent: facets.totals[0]?.totalSpent ?? 0,
    expenseCount: facets.totals[0]?.count ?? 0,
  };
}

/** totalSpent + my own net for many groups at once — used by the groups list. */
export async function summariseGroupsFor(userId, groupIds) {
  const ids = groupIds.map(oid);
  const me = oid(userId);

  const [spend, paid, owed, settled] = await Promise.all([
    GroupExpense.aggregate([
      { $match: { groupId: { $in: ids }, deletedAt: null } },
      { $group: { _id: '$groupId', totalSpent: { $sum: '$totalAmount' } } },
    ]),
    GroupExpense.aggregate([
      { $match: { groupId: { $in: ids }, deletedAt: null } },
      { $unwind: '$paidBy' },
      { $match: { 'paidBy.userId': me } },
      { $group: { _id: '$groupId', amount: { $sum: '$paidBy.amount' } } },
    ]),
    GroupExpense.aggregate([
      { $match: { groupId: { $in: ids }, deletedAt: null } },
      { $unwind: '$splits' },
      { $match: { 'splits.userId': me } },
      { $group: { _id: '$groupId', amount: { $sum: '$splits.share' } } },
    ]),
    Settlement.aggregate([
      { $match: { groupId: { $in: ids }, isPaid: true, $or: [{ fromUser: me }, { toUser: me }] } },
      {
        $group: {
          _id: '$groupId',
          amount: { $sum: { $cond: [{ $eq: ['$fromUser', me] }, '$amount', { $multiply: ['$amount', -1] }] } },
        },
      },
    ]),
  ]);

  const index = (rows, key = 'amount') => Object.fromEntries(rows.map((r) => [String(r._id), r[key]]));
  const spendBy = index(spend, 'totalSpent');
  const paidBy = index(paid);
  const owedBy = index(owed);
  const settledBy = index(settled);

  return Object.fromEntries(
    groupIds.map((id) => {
      const key = String(id);
      return [
        key,
        {
          totalSpent: spendBy[key] ?? 0,
          myBalance: (paidBy[key] ?? 0) - (owedBy[key] ?? 0) + (settledBy[key] ?? 0),
        },
      ];
    }),
  );
}
