import mongoose from 'mongoose';

import { PersonalExpense } from '../models/PersonalExpense.js';
import { Budget } from '../models/Budget.js';
import { CATEGORIES } from '../models/GroupExpense.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { advance } from '../services/recurring.js';

/** "2026-09" → the half-open range [start, end) for that month. */
export function monthRange(month) {
  const [year, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
  return { start: new Date(year, m - 1, 1), end: new Date(year, m, 1) };
}

const publicTransaction = (t) => ({
  id: t._id,
  title: t.title,
  amount: t.amount,
  category: t.category,
  type: t.type,
  paymentMethod: t.paymentMethod,
  date: t.date,
  note: t.note,
  receiptUrl: t.receiptUrl,
  isRecurring: t.isRecurring,
  recurring: t.recurring,
  generatedFrom: t.generatedFrom,
  suggestedAlternatives: t.suggestedAlternatives,
  potentialSavings: t.potentialSavings,
});

// A recurring transaction schedules its next run from its own date.
const recurringFields = (body) =>
  body.isRecurring
    ? { isRecurring: true, recurring: { interval: body.recurringInterval, nextRunAt: advance(body.date, body.recurringInterval) } }
    : { isRecurring: false, recurring: { interval: null, nextRunAt: null } };

export async function createTransaction(req, res) {
  const { recurringInterval, ...rest } = req.body;
  const transaction = await PersonalExpense.create({
    ...rest,
    ...recurringFields(req.body),
    userId: req.user._id,
  });

  ok(res, { transaction: publicTransaction(transaction) }, 201);
}

export async function listTransactions(req, res) {
  const { month, category, type, page, limit } = req.query;

  const filter = { userId: req.user._id };
  if (category) filter.category = category;
  if (type) filter.type = type;
  if (month) {
    const { start, end } = monthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  const [transactions, total] = await Promise.all([
    PersonalExpense.find(filter).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PersonalExpense.countDocuments(filter),
  ]);

  ok(res, {
    transactions: transactions.map(publicTransaction),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
}

async function ownTransaction(req) {
  const transaction = await PersonalExpense.findOne({ _id: req.params.transactionId, userId: req.user._id });
  if (!transaction) throw ApiError.notFound('Transaction not found', 'TRANSACTION_NOT_FOUND');
  return transaction;
}

export async function updateTransaction(req, res) {
  const transaction = await ownTransaction(req);
  const { recurringInterval, ...rest } = req.body;

  Object.assign(transaction, rest);
  if ('isRecurring' in req.body) {
    Object.assign(transaction, recurringFields({ ...publicTransaction(transaction), ...req.body }));
  }
  await transaction.save();

  ok(res, { transaction: publicTransaction(transaction) });
}

export async function deleteTransaction(req, res) {
  const transaction = await ownTransaction(req);
  await transaction.deleteOne();
  ok(res, { deleted: true });
}

/** Income, spend, net and per-category totals against each budget cap. */
export async function summary(req, res) {
  const { start, end } = monthRange(req.query.month);
  const userId = new mongoose.Types.ObjectId(String(req.user._id));

  const [rows, budgets, previous] = await Promise.all([
    PersonalExpense.aggregate([
      { $match: { userId, date: { $gte: start, $lt: end } } },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Budget.find({ userId: req.user._id }).lean(),
    PersonalExpense.aggregate([
      {
        $match: {
          userId,
          type: 'DEBIT',
          date: { $gte: new Date(start.getFullYear(), start.getMonth() - 1, 1), $lt: start },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const income = rows.filter((r) => r._id.type === 'CREDIT').reduce((t, r) => t + r.total, 0);
  const spend = rows.filter((r) => r._id.type === 'DEBIT').reduce((t, r) => t + r.total, 0);
  const capFor = Object.fromEntries(budgets.map((b) => [b.category, b.monthlyCap]));

  const byCategory = CATEGORIES.map((category) => {
    const total = rows.filter((r) => r._id.type === 'DEBIT' && r._id.category === category).reduce((t, r) => t + r.total, 0);
    const cap = capFor[category] ?? null;
    return {
      category,
      total,
      cap,
      // What the coloured bars key off: green, amber at 80%, red at 100%.
      consumed: cap ? Math.round((total / cap) * 100) : null,
    };
  }).filter((c) => c.total > 0 || c.cap);

  const savingsFound = await PersonalExpense.aggregate([
    { $match: { userId, date: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$potentialSavings' } } },
  ]);

  ok(res, {
    month: req.query.month || new Date().toISOString().slice(0, 7),
    income,
    spend,
    net: income - spend,
    lastMonthSpend: previous[0]?.total ?? 0,
    savingsFound: savingsFound[0]?.total ?? 0,
    byCategory,
  });
}

export async function listBudgets(req, res) {
  const budgets = await Budget.find({ userId: req.user._id }).sort({ category: 1 }).lean();
  ok(res, { budgets: budgets.map((b) => ({ id: b._id, category: b.category, monthlyCap: b.monthlyCap })) });
}

/** Upsert — one cap per category, so setting it twice just updates it. */
export async function setBudget(req, res) {
  const budget = await Budget.findOneAndUpdate(
    { userId: req.user._id, category: req.body.category },
    { monthlyCap: req.body.monthlyCap },
    { returnDocument: 'after', upsert: true },
  );
  ok(res, { budget: { id: budget._id, category: budget.category, monthlyCap: budget.monthlyCap } }, 201);
}

export async function deleteBudget(req, res) {
  const deleted = await Budget.findOneAndDelete({ _id: req.params.budgetId, userId: req.user._id });
  if (!deleted) throw ApiError.notFound('Budget not found', 'BUDGET_NOT_FOUND');
  ok(res, { deleted: true });
}
