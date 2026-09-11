import { Router } from 'express';

import * as ctrl from '../controllers/expenses.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireMember } from '../middleware/membership.js';
import { loadExpense } from '../middleware/loadExpense.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  groupParamsSchema,
  expenseParamsSchema,
} from './expenses.schemas.js';

const router = Router();

router.post(
  '/groups/:id/expenses',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  validate(createExpenseSchema),
  asyncHandler(requireMember),
  asyncHandler(ctrl.createExpense),
);

router.get(
  '/groups/:id/expenses',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  validate(listExpensesQuerySchema, 'query'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.listExpenses),
);

router.get(
  '/groups/:id/balances',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.getBalances),
);

router.get(
  '/expenses/:expenseId',
  requireAuth,
  validate(expenseParamsSchema, 'params'),
  asyncHandler(loadExpense),
  asyncHandler(ctrl.getExpense),
);

router.patch(
  '/expenses/:expenseId',
  requireAuth,
  validate(expenseParamsSchema, 'params'),
  validate(updateExpenseSchema),
  asyncHandler(loadExpense),
  asyncHandler(ctrl.updateExpense),
);

router.delete(
  '/expenses/:expenseId',
  requireAuth,
  validate(expenseParamsSchema, 'params'),
  asyncHandler(loadExpense),
  asyncHandler(ctrl.deleteExpense),
);

export default router;
