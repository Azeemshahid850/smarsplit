import { GroupExpense } from '../models/GroupExpense.js';
import { ApiError } from '../middleware/ApiError.js';
import { canEditExpense } from '../middleware/membership.js';
import { ok } from '../utils/ok.js';
import { groupBalances } from '../services/balances.js';
import { notify, activeMemberIds } from '../services/notifications.js';
import { computeSplits, assertPayersCoverTotal, assertSplitsBalance, SplitError } from '../services/splitCalculator.js';
import { categoriesForGroup, assertCategoryAllowed } from '../services/categories.js';
import { convertToPkr } from '../services/currency.js';
import { pkrRate } from '../services/fx.js';

const publicFx = (fx) =>
  fx && {
    currency: fx.currency,
    rate: fx.rate,
    rateDate: fx.rateDate,
    totalAmount: fx.totalAmount,
    paidBy: fx.paidBy.map((payerEntry) => ({ userId: payerEntry.userId, amount: payerEntry.amount })),
    exact: fx.exact.map((exactEntry) => ({ userId: exactEntry.userId, share: exactEntry.share })),
    itemPrices: fx.itemPrices,
  };

const publicExpense = (expenseRow) => ({
  id: expenseRow._id,
  groupId: expenseRow.groupId,
  title: expenseRow.title,
  totalAmount: expenseRow.totalAmount,
  currency: expenseRow.fx?.currency ?? 'PKR',
  fx: publicFx(expenseRow.fx) ?? null,
  category: expenseRow.category,
  date: expenseRow.date,
  notes: expenseRow.notes,
  receiptImage: expenseRow.receiptImage,
  splitType: expenseRow.splitType,
  paidBy: expenseRow.paidBy.map((payerEntry) => ({ userId: payerEntry.userId, amount: payerEntry.amount })),
  splits: expenseRow.splits.map((splitEntry) => ({ userId: splitEntry.userId, share: splitEntry.share })),
  items: expenseRow.items,
  createdBy: expenseRow.createdBy,
  createdAt: expenseRow.createdAt,
});

// Everyone named on an expense must be an active member of that group.
function assertEveryoneIsAMember(group, body) {
  const active = new Set(group.members.filter((member) => member.status === 'active' && member.user).map((member) => String(member.user)));

  const named = [
    ...body.paidBy.map((payerEntry) => payerEntry.userId),
    ...body.participants,
    ...body.exact.map((expenseRow) => expenseRow.userId),
    ...body.percentages.map((payerEntry) => payerEntry.userId),
    ...body.items.flatMap((lineItem) => lineItem.sharedBy),
  ];

  const stranger = named.find((id) => !active.has(String(id)));
  if (stranger) throw ApiError.badRequest('Everyone on an expense must be an active member of the group', 'NOT_A_MEMBER');
}

// Runs the calculator and converts its errors into 400s the UI can show.
function buildSplits(body) {
  try {
    assertPayersCoverTotal(body.paidBy, body.totalAmount);
    const splits = computeSplits(body);
    assertSplitsBalance(splits, body.totalAmount);
    return splits;
  } catch (err) {
    if (err instanceof SplitError) throw ApiError.badRequest(err.message, 'SPLIT_INVALID');
    throw err;
  }
}

const money = (rupees) => `Rs ${Math.round(rupees).toLocaleString('en-PK')}`;

// A foreign-currency body is converted to integer rupees before anything else
// sees it; from there on it is an ordinary PKR expense. New expenses use today's
// rate; an edit that keeps the currency keeps the rate it was entered at.
async function inRupees({ currency = 'PKR', ...body }, previousFx = null) {
  if (currency === 'PKR') return { body, fx: null };
  const fxRate = previousFx?.currency === currency ? previousFx : await pkrRate(currency);
  try {
    return convertToPkr(body, fxRate);
  } catch (err) {
    if (err instanceof SplitError) throw ApiError.badRequest(err.message, 'SPLIT_INVALID');
    throw err;
  }
}

export async function createExpense(req, res) {
  const group = req.group;
  const { body, fx } = await inRupees(req.body);
  assertEveryoneIsAMember(group, body);
  body.category = assertCategoryAllowed(body.category, await categoriesForGroup(group)) ?? body.category;

  const splits = buildSplits(body);
  const expense = await GroupExpense.create({
    ...body,
    fx,
    groupId: group._id,
    splits,
    createdBy: req.user._id,
  });

  ok(res, { expense: publicExpense(expense) }, 201);

  await notify({
    recipients: activeMemberIds(group),
    exclude: req.user._id,
    type: 'EXPENSE_ADDED',
    message: `${req.user.name.split(' ')[0]} logged ${money(expense.totalAmount)} for ${expense.title} in ${group.title}`,
    groupId: group._id,
    meta: { expenseId: expense._id, amount: expense.totalAmount },
  });
}

export async function listExpenses(req, res) {
  const { page, limit, category, payer, from, to } = req.query;

  const filter = { groupId: req.group._id, deletedAt: null };
  if (category) filter.category = category;
  if (payer) filter['paidBy.userId'] = payer;
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const [expenses, total] = await Promise.all([
    GroupExpense.find(filter).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    GroupExpense.countDocuments(filter),
  ]);

  ok(res, {
    expenses: expenses.map(publicExpense),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
}

export async function getExpense(req, res) {
  ok(res, { expense: publicExpense(req.expense), groupId: req.group._id });
}

export async function updateExpense(req, res) {
  const { expense, group, membership } = req;
  if (!canEditExpense(group, membership, expense)) {
    throw ApiError.forbidden('Only the payer or an admin can edit this expense', 'CANNOT_EDIT_EXPENSE');
  }

  // Recompute from the merged document so a partial edit still balances. A
  // partial body arrives carrying Zod's [] defaults, so anything the caller did
  // not actually send is rebuilt from the stored splits — except when the caller
  // sends a currency: then every amount came with it, in that currency, and
  // stored rupee figures must not be mixed in.
  const sentCurrency = req.body.currency !== undefined;
  const previous = expense.splits.map((splitEntry) => ({ userId: String(splitEntry.userId), share: splitEntry.share }));
  const { currency: _stored, fx: _storedFx, ...stored } = publicExpense(expense);
  const merged = { ...stored, ...req.body };

  if (!req.body.participants?.length) merged.participants = previous.map((splitEntry) => splitEntry.userId);
  if (!sentCurrency && !req.body.exact?.length) merged.exact = previous;
  if (!req.body.percentages?.length) {
    merged.percentages = previous.map((splitEntry) => ({ userId: splitEntry.userId, percent: (splitEntry.share / expense.totalAmount) * 100 }));
  }
  if (!sentCurrency && !req.body.items?.length) merged.items = expense.items;

  // Rupee amounts sent without a currency replace any foreign figures on record.
  const sentAmounts = req.body.totalAmount !== undefined || req.body.paidBy !== undefined || req.body.exact?.length || req.body.items?.length;
  const { body, fx } = sentCurrency ? await inRupees(merged, expense.fx) : { body: merged, fx: sentAmounts ? null : expense.fx };

  assertEveryoneIsAMember(group, body);
  if (req.body.category) {
    body.category = assertCategoryAllowed(req.body.category, await categoriesForGroup(group));
  }
  const splits = buildSplits(body);

  const { currency: _sent, ...changes } = req.body;
  const converted = sentCurrency
    ? { totalAmount: body.totalAmount, paidBy: body.paidBy, exact: body.exact, items: body.items }
    : {};
  Object.assign(expense, changes, converted, { category: body.category ?? expense.category, splits, fx });
  await expense.save();

  ok(res, { expense: publicExpense(expense) });
}

export async function deleteExpense(req, res) {
  const { expense, group, membership } = req;
  if (!canEditExpense(group, membership, expense)) {
    throw ApiError.forbidden('Only the payer or an admin can delete this expense', 'CANNOT_EDIT_EXPENSE');
  }

  expense.deletedAt = new Date(); // soft delete — history stays auditable
  await expense.save();
  ok(res, { deleted: true });
}

export async function getBalances(req, res) {
  const group = req.group;
  const { net, totalSpent, expenseCount } = await groupBalances(group._id);
  await group.populate('members.user', 'name avatarUrl');

  const balances = group.members
    .filter((member) => member.status === 'active' && member.user)
    .map((member) => ({
      userId: member.user._id,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl,
      net: net.get(String(member.user._id)) ?? 0,
    }))
    .sort((leftSplit, rightSplit) => rightSplit.net - leftSplit.net);

  ok(res, {
    balances,
    totalSpent,
    expenseCount,
    // Proof for the UI footnote: a correct ledger always nets to zero.
    netsToZero: balances.reduce((runningTotal, rightSplit) => runningTotal + rightSplit.net, 0) === 0,
  });
}

export { publicExpense };
