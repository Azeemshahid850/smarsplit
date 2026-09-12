import mongoose from 'mongoose';

import { PersonalExpense } from '../models/PersonalExpense.js';
import { Budget } from '../models/Budget.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { advance } from '../services/recurring.js';
import { categoriesFor, assertCategoryAllowed } from '../services/categories.js';

/** "2026-09" → the half-open range [start, end) for that month. */
export function monthRange(month) {
  const [year, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
  return { start: new Date(year, m - 1, 1), end: new Date(year, m, 1) };
}

const publicTransaction = (transaction) => ({
  id: transaction._id,
  title: transaction.title,
  amount: transaction.amount,
  category: transaction.category,
  type: transaction.type,
  paymentMethod: transaction.paymentMethod,
  date: transaction.date,
  note: transaction.note,
  receiptUrl: transaction.receiptUrl,
  isRecurring: transaction.isRecurring,
  recurring: transaction.recurring,
  generatedFrom: transaction.generatedFrom,
  suggestedAlternatives: transaction.suggestedAlternatives,
  potentialSavings: transaction.potentialSavings,
});

// A recurring transaction schedules its next run from its own date.
const recurringFields = (body) =>
  body.isRecurring
    ? { isRecurring: true, recurring: { interval: body.recurringInterval, nextRunAt: advance(body.date, body.recurringInterval) } }
    : { isRecurring: false, recurring: { interval: null, nextRunAt: null } };

export async function createTransaction(req, res) {
  const { all } = await categoriesFor(req.user._id);
  req.body.category = assertCategoryAllowed(req.body.category, all) ?? req.body.category;

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
  if (req.body.category) {
    const { all } = await categoriesFor(req.user._id);
    req.body.category = assertCategoryAllowed(req.body.category, all);
  }
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

  const income = rows.filter((aggregateRow) => aggregateRow._id.type === 'CREDIT').reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);
  const spend = rows.filter((aggregateRow) => aggregateRow._id.type === 'DEBIT').reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);
  const capFor = Object.fromEntries(budgets.map((budgetRow) => [budgetRow.category, budgetRow.monthlyCap]));

  // Their categories, plus any older one that still has spend this month, so a
  // deleted category never hides money that was already recorded against it.
  const { all } = await categoriesFor(req.user._id);
  const spent = rows.filter((aggregateRow) => aggregateRow._id.type === 'DEBIT').map((aggregateRow) => aggregateRow._id.category);
  const names = [...new Set([...all, ...spent, ...budgets.map((budgetRow) => budgetRow.category)])];

  const byCategory = names.map((category) => {
    const total = rows.filter((aggregateRow) => aggregateRow._id.type === 'DEBIT' && aggregateRow._id.category === category).reduce((runningTotal, aggregateRow) => runningTotal + aggregateRow.total, 0);
    const cap = capFor[category] ?? null;
    return {
      category,
      total,
      cap,
      // What the coloured bars key off: green, amber at 80%, red at 100%.
      consumed: cap ? Math.round((total / cap) * 100) : null,
    };
  }).filter((categoryTotal) => categoryTotal.total > 0 || categoryTotal.cap);

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
  ok(res, { budgets: budgets.map((budgetRow) => ({ id: budgetRow._id, category: budgetRow.category, monthlyCap: budgetRow.monthlyCap })) });
}

/** Upsert — one cap per category, so setting it twice just updates it. */
export async function setBudget(req, res) {
  const { all } = await categoriesFor(req.user._id);
  req.body.category = assertCategoryAllowed(req.body.category, all);

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
