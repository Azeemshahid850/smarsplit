import { z } from 'zod';
import { CATEGORIES } from '../models/GroupExpense.js';
import { PAYMENT_METHODS, RECURRING_INTERVALS } from '../models/PersonalExpense.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Month must look like 2026-09');

const transactionShape = {
  title: z.string().min(2, 'Title is too short').max(120).trim(),
  amount: z.number().int('Amounts must be whole rupees').positive('Amount must be above zero'),
  category: z.enum(CATEGORIES).default('Misc'),
  type: z.enum(['CREDIT', 'DEBIT']).default('DEBIT'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('Cash'),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().max(300).default(''),
  receiptUrl: z.string().url().nullish(),
  isRecurring: z.boolean().default(false),
  recurringInterval: z.enum(RECURRING_INTERVALS).nullish(),
};

export const createTransactionSchema = z
  .object(transactionShape)
  .refine((v) => !v.isRecurring || Boolean(v.recurringInterval), {
    message: 'Pick how often this repeats',
    path: ['recurringInterval'],
  });

export const updateTransactionSchema = z.object(transactionShape).partial();

export const listTransactionsQuerySchema = z.object({
  month: month.optional(),
  category: z.enum(CATEGORIES).optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const summaryQuerySchema = z.object({ month: month.optional() });
export const budgetSchema = z.object({ category: z.enum(CATEGORIES), monthlyCap: z.number().int().positive() });
export const transactionParamsSchema = z.object({ transactionId: objectId });
export const budgetParamsSchema = z.object({ budgetId: objectId });
