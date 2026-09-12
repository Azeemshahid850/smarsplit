import { Category } from '../models/Category.js';
import { Group } from '../models/Group.js';
import { ApiError } from '../middleware/ApiError.js';

/** Every account starts with these; they can never be deleted. */
export const DEFAULT_CATEGORIES = ['Food', 'Utilities', 'Travel', 'Shopping', 'Healthcare', 'Housing', 'Misc'];

export const isDefault = (name) => DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === String(name).toLowerCase());

/** Defaults plus this user's own, defaults first and custom ones alphabetical. */
export async function categoriesFor(userId) {
  const custom = await Category.find({ userId }).sort({ name: 1 }).lean();
  return {
    defaults: DEFAULT_CATEGORIES,
    custom: custom.map((c) => ({ id: c._id, name: c.name })),
    all: [...DEFAULT_CATEGORIES, ...custom.map((c) => c.name)],
  };
}

/**
 * A group expense may use any default, or any custom category belonging to an
 * active member — so a category one member invented still works for the whole
 * group rather than only for its author.
 */
export async function categoriesForGroup(group) {
  const memberIds = group.members.filter((m) => m.status === 'active' && m.user).map((m) => m.user._id ?? m.user);
  const custom = await Category.find({ userId: { $in: memberIds } }).lean();
  return [...DEFAULT_CATEGORIES, ...new Set(custom.map((c) => c.name))];
}

/**
 * Categories are free text in the database (so historic rows survive a category
 * being deleted), which means the allow-list check has to happen here.
 */
export function assertCategoryAllowed(category, allowed) {
  if (category == null) return;
  const match = allowed.find((c) => c.toLowerCase() === String(category).toLowerCase());
  if (!match) {
    throw ApiError.badRequest(`"${category}" is not one of your categories`, 'UNKNOWN_CATEGORY');
  }
  return match;
}

/** Where a custom category is still referenced, so deleting one can warn first. */
export async function categoryUsage(userId, name) {
  const { PersonalExpense } = await import('../models/PersonalExpense.js');
  const { GroupExpense } = await import('../models/GroupExpense.js');
  const { Budget } = await import('../models/Budget.js');

  const groups = await Group.find({ members: { $elemMatch: { user: userId, status: 'active' } } }).select('_id').lean();

  const [transactions, expenses, budgets] = await Promise.all([
    PersonalExpense.countDocuments({ userId, category: name }),
    GroupExpense.countDocuments({ groupId: { $in: groups.map((g) => g._id) }, category: name, deletedAt: null }),
    Budget.countDocuments({ userId, category: name }),
  ]);

  return { transactions, expenses, budgets, total: transactions + expenses + budgets };
}
