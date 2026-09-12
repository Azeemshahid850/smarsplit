import { Router } from 'express';

import * as ctrl from '../controllers/personal.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
  budgetSchema,
  transactionParamsSchema,
  budgetParamsSchema,
} from './personal.schemas.js';

const router = Router();

router.post('/transactions', requireAuth, validate(createTransactionSchema), asyncHandler(ctrl.createTransaction));
router.get('/transactions', requireAuth, validate(listTransactionsQuerySchema, 'query'), asyncHandler(ctrl.listTransactions));
router.patch(
  '/transactions/:transactionId',
  requireAuth,
  validate(transactionParamsSchema, 'params'),
  validate(updateTransactionSchema),
  asyncHandler(ctrl.updateTransaction),
);
router.delete(
  '/transactions/:transactionId',
  requireAuth,
  validate(transactionParamsSchema, 'params'),
  asyncHandler(ctrl.deleteTransaction),
);

router.get('/personal/summary', requireAuth, validate(summaryQuerySchema, 'query'), asyncHandler(ctrl.summary));

router.get('/budgets', requireAuth, asyncHandler(ctrl.listBudgets));
router.put('/budgets', requireAuth, validate(budgetSchema), asyncHandler(ctrl.setBudget));
router.delete('/budgets/:budgetId', requireAuth, validate(budgetParamsSchema, 'params'), asyncHandler(ctrl.deleteBudget));

export default router;
