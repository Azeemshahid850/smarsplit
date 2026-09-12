import { Group } from '../models/Group.js';
import { ApiError } from './ApiError.js';

// Loads the group and proves the caller is an ACTIVE member. Never trusts a
// client-sent member id. Attaches req.group and req.membership.
export async function requireMember(req, res, next) {
  const group = await Group.findById(req.params.id || req.params.groupId);
  // Same 404 for "missing" and "not yours" so ids cannot be probed.
  if (!group) return next(ApiError.notFound('Group not found', 'GROUP_NOT_FOUND'));

  const membership = group.memberFor(req.user._id);
  if (!membership) return next(ApiError.forbidden('You are not a member of this group', 'NOT_A_MEMBER'));

  req.group = group;
  req.membership = membership;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.membership.role !== 'admin') {
    return next(ApiError.forbidden('Only a group admin can do that', 'NOT_ADMIN'));
  }
  next();
}

// Editing an expense: the payer, an admin, or anyone when the group allows it.
export function canEditExpense(group, membership, expense) {
  if (group.settings.anyoneCanEdit) return true;
  if (membership.role === 'admin') return true;
  return expense.paidBy.some((payerEntry) => String(payerEntry.userId) === String(membership.user));
}
