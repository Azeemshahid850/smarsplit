import { GroupExpense } from '../models/GroupExpense.js';
import { Group } from '../models/Group.js';
import { ApiError } from './ApiError.js';

// For /expenses/:expenseId routes: resolves the expense, then its group, then
// proves the caller is an active member of that group.
export async function loadExpense(req, res, next) {
  const expense = await GroupExpense.findOne({ _id: req.params.expenseId, deletedAt: null });
  if (!expense) return next(ApiError.notFound('Expense not found', 'EXPENSE_NOT_FOUND'));

  const group = await Group.findById(expense.groupId);
  if (!group) return next(ApiError.notFound('Group not found', 'GROUP_NOT_FOUND'));

  const membership = group.memberFor(req.user._id);
  if (!membership) return next(ApiError.forbidden('You are not a member of this group', 'NOT_A_MEMBER'));

  req.expense = expense;
  req.group = group;
  req.membership = membership;
  next();
}
