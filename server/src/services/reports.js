import mongoose from 'mongoose';

import { PersonalExpense } from '../models/PersonalExpense.js';
import { Budget } from '../models/Budget.js';
import { GroupExpense } from '../models/GroupExpense.js';
import { Settlement } from '../models/Settlement.js';
import { categoriesFor } from './categories.js';
import { monthRange } from '../controllers/personal.controller.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/** One month of personal finances, with deltas against the month before. */
export async function personalMonthly(userId, month) {
  const { start, end } = monthRange(month);
  const previous = { start: new Date(start.getFullYear(), start.getMonth() - 1, 1), end: start };
  const user = oid(userId);

  const totalsFor = async (range) =>
    PersonalExpense.aggregate([
      { $match: { userId: user, date: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
    ]);

  const [rows, previousRows, biggest] = await Promise.all([
    totalsFor({ start, end }),
    totalsFor(previous),
    PersonalExpense.findOne({ userId: user, type: 'DEBIT', date: { $gte: start, $lt: end } }).sort({ amount: -1 }).lean(),
  ]);

  const sum = (list, type) => list.filter((aggregateRow) => aggregateRow._id.type === type).reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);

  const income = sum(rows, 'CREDIT');
  const spend = sum(rows, 'DEBIT');
  const lastSpend = sum(previousRows, 'DEBIT');
  const lastIncome = sum(previousRows, 'CREDIT');

  const topCategories = rows
    .filter((aggregateRow) => aggregateRow._id.type === 'DEBIT')
    .map((aggregateRow) => ({ category: aggregateRow._id.category, total: aggregateRow.total, share: pct(aggregateRow.total, spend) }))
    .sort((leftMember, budgetRow) => budgetRow.total - leftMember.total);

  return {
    month: month || new Date().toISOString().slice(0, 7),
    income,
    spend,
    net: income - spend,
    savingsRate: income ? Math.round(((income - spend) / income) * 100) : 0,
    topCategories,
    biggestExpense: biggest ? { title: biggest.title, amount: biggest.amount, category: biggest.category, date: biggest.date } : null,
    vsLastMonth: {
      spend: spend - lastSpend,
      income: income - lastIncome,
      spendPercent: lastSpend ? Math.round(((spend - lastSpend) / lastSpend) * 100) : null,
    },
  };
}

/** Per-category monthly series for the last N months, oldest first. */
export async function personalTrends(userId, months = 6) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const rows = await PersonalExpense.aggregate([
    { $match: { userId: oid(userId), date: { $gte: start } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type', category: '$category' },
        total: { $sum: '$amount' },
      },
    },
  ]);

  const labels = Array.from({ length: months }, (_, i) => {
    const dayRow = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return `${dayRow.getFullYear()}-${String(dayRow.getMonth() + 1).padStart(2, '0')}`;
  });

  const find = (month, type, category) =>
    rows.find((aggregateRow) => aggregateRow._id.month === month && aggregateRow._id.type === type && (!category || aggregateRow._id.category === category))?.total ?? 0;

  const { all: categoryNames } = await categoriesFor(userId);
  const seen = [...new Set([...categoryNames, ...rows.map((aggregateRow) => aggregateRow._id.category)])];

  const series = labels.map((month) => {
    const inflow = rows.filter((aggregateRow) => aggregateRow._id.month === month && aggregateRow._id.type === 'CREDIT').reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);
    const outflow = rows.filter((aggregateRow) => aggregateRow._id.month === month && aggregateRow._id.type === 'DEBIT').reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);
    const byCategory = Object.fromEntries(seen.map((categoryRow) => [categoryRow, find(month, 'DEBIT', categoryRow)]));
    return { month, inflow, outflow, net: inflow - outflow, ...byCategory };
  });

  const budgets = await Budget.find({ userId }).lean();
  const current = labels.at(-1);
  const budgetVsActual = budgets.map((budgetRow) => ({
    category: budgetRow.category,
    cap: budgetRow.monthlyCap,
    actual: find(current, 'DEBIT', budgetRow.category),
  }));

  return { months: labels, series, budgetVsActual };
}

/** Everything the group report page needs, in one aggregation pass. */
export async function groupSummary(group) {
  const groupId = oid(group._id);

  const [byCategory, byDay, paid, consumed, settlements] = await Promise.all([
    GroupExpense.aggregate([
      { $match: { groupId, deletedAt: null } },
      { $group: { _id: '$category', total: { $sum: '$totalAmount' } } },
      { $sort: { total: -1 } },
    ]),
    GroupExpense.aggregate([
      { $match: { groupId, deletedAt: null } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$totalAmount' } } },
      { $sort: { _id: 1 } },
    ]),
    GroupExpense.aggregate([
      { $match: { groupId, deletedAt: null } },
      { $unwind: '$paidBy' },
      { $group: { _id: '$paidBy.userId', total: { $sum: '$paidBy.amount' } } },
    ]),
    GroupExpense.aggregate([
      { $match: { groupId, deletedAt: null } },
      { $unwind: '$splits' },
      { $group: { _id: '$splits.userId', total: { $sum: '$splits.share' } } },
    ]),
    Settlement.find({ groupId }).lean(),
  ]);

  const total = byCategory.reduce((runningTotal, categoryRow) => runningTotal + categoryRow.total, 0);
  const index = (rows) => Object.fromEntries(rows.map((aggregateRow) => [String(aggregateRow._id), aggregateRow.total]));
  const paidBy = index(paid);
  const consumedBy = index(consumed);

  const members = group.members
    .filter((member) => member.status === 'active' && member.user)
    .map((member) => {
      const id = String(member.user._id ?? member.user);
      return {
        userId: id,
        name: member.user.name ?? member.name ?? member.email,
        paid: paidBy[id] ?? 0,
        consumed: consumedBy[id] ?? 0,
        // Fairness: what they used as a share of what everyone used.
        share: pct(consumedBy[id] ?? 0, total),
      };
    })
    .sort((leftMember, budgetRow) => budgetRow.paid - leftMember.paid);

  const rawDebtCount = settlements[0]?.rawDebtCount ?? 0;
  const optimizedCount = settlements.length;

  return {
    title: group.title,
    baseCurrency: group.baseCurrency,
    status: group.status,
    total,
    perPerson: members.length ? Math.round(total / members.length) : 0,
    byCategory: byCategory.map((categoryRow) => ({ category: categoryRow._id, total: categoryRow.total, share: pct(categoryRow.total, total) })),
    timeline: byDay.map((dayRow) => ({ date: dayRow._id, total: dayRow.total })),
    members,
    settlementEfficiency: {
      rawDebtCount,
      optimizedCount,
      transfersSaved: Math.max(rawDebtCount - optimizedCount, 0),
      paidCount: settlements.filter((rightMember) => rightMember.isPaid).length,
    },
  };
}
