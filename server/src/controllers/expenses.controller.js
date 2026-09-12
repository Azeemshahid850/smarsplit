import { GroupExpense } from '../models/GroupExpense.js';
import { ApiError } from '../middleware/ApiError.js';
import { canEditExpense } from '../middleware/membership.js';
import { ok } from '../utils/ok.js';
import { groupBalances } from '../services/balances.js';
import { notify, activeMemberIds } from '../services/notifications.js';
import { computeSplits, assertPayersCoverTotal, assertSplitsBalance, SplitError } from '../services/splitCalculator.js';
import { categoriesForGroup, assertCategoryAllowed } from '../services/categories.js';

const publicExpense = (e) => ({
  id: e._id,
  groupId: e.groupId,
  title: e.title,
  totalAmount: e.totalAmount,
  category: e.category,
  date: e.date,
  notes: e.notes,
  receiptImage: e.receiptImage,
  splitType: e.splitType,
  paidBy: e.paidBy.map((p) => ({ userId: p.userId, amount: p.amount })),
  splits: e.splits.map((s) => ({ userId: s.userId, share: s.share })),
  items: e.items,
  createdBy: e.createdBy,
  createdAt: e.createdAt,
});

// Everyone named on an expense must be an active member of that group.
function assertEveryoneIsAMember(group, body) {
  const active = new Set(group.members.filter((m) => m.status === 'active' && m.user).map((m) => String(m.user)));

  const named = [
    ...body.paidBy.map((p) => p.userId),
    ...body.participants,
    ...body.exact.map((e) => e.userId),
    ...body.percentages.map((p) => p.userId),
    ...body.items.flatMap((i) => i.sharedBy),
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

const money = (n) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;

export async function createExpense(req, res) {
  const group = req.group;
  assertEveryoneIsAMember(group, req.body);
  req.body.category = assertCategoryAllowed(req.body.category, await categoriesForGroup(group)) ?? req.body.category;

  const splits = buildSplits(req.body);
  const expense = await GroupExpense.create({
    ...req.body,
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
  // not actually send is rebuilt from the stored splits.
  const previous = expense.splits.map((s) => ({ userId: String(s.userId), share: s.share }));
  const merged = { ...publicExpense(expense), ...req.body };

  if (!req.body.participants?.length) merged.participants = previous.map((s) => s.userId);
  if (!req.body.exact?.length) merged.exact = previous;
  if (!req.body.percentages?.length) {
    merged.percentages = previous.map((s) => ({ userId: s.userId, percent: (s.share / expense.totalAmount) * 100 }));
  }
  if (!req.body.items?.length) merged.items = expense.items;
  assertEveryoneIsAMember(group, merged);
  if (req.body.category) {
    req.body.category = assertCategoryAllowed(req.body.category, await categoriesForGroup(group));
  }
  const splits = buildSplits(merged);

  Object.assign(expense, req.body, { splits });
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
    .filter((m) => m.status === 'active' && m.user)
    .map((m) => ({
      userId: m.user._id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      net: net.get(String(m.user._id)) ?? 0,
    }))
    .sort((a, b) => b.net - a.net);

  ok(res, {
    balances,
    totalSpent,
    expenseCount,
    // Proof for the UI footnote: a correct ledger always nets to zero.
    netsToZero: balances.reduce((t, b) => t + b.net, 0) === 0,
  });
}

export { publicExpense };
