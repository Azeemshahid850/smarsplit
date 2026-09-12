import { Category } from '../models/Category.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { categoriesFor, isDefault, categoryUsage } from '../services/categories.js';

export async function listCategories(req, res) {
  ok(res, await categoriesFor(req.user._id));
}

export async function createCategory(req, res) {
  const { name } = req.body;

  if (isDefault(name)) throw ApiError.conflict(`"${name}" is already a built-in category`, 'CATEGORY_EXISTS');

  const clash = await Category.findOne({ userId: req.user._id, name }).collation({ locale: 'en', strength: 2 });
  if (clash) throw ApiError.conflict(`You already have a "${clash.name}" category`, 'CATEGORY_EXISTS');

  const category = await Category.create({ userId: req.user._id, name });
  ok(res, { category: { id: category._id, name: category.name } }, 201);
}

/**
 * Deleting a category never touches the rows that used it — those keep the name
 * as plain text, so history and reports stay honest. The response says how many
 * rows that was.
 */
export async function deleteCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.categoryId, userId: req.user._id });
  if (!category) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const usage = await categoryUsage(req.user._id, category.name);
  await category.deleteOne();

  ok(res, { deleted: true, name: category.name, stillUsedBy: usage });
}

/** What the delete confirmation shows before anything is removed. */
export async function categoryUsageCount(req, res) {
  const category = await Category.findOne({ _id: req.params.categoryId, userId: req.user._id });
  if (!category) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  ok(res, { name: category.name, usage: await categoryUsage(req.user._id, category.name) });
}
