import { z } from 'zod';
import { CATEGORIES, SPLIT_TYPES } from '../models/GroupExpense.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const rupees = z.number().int('Amounts must be whole rupees').positive('Amount must be above zero');

const base = {
  title: z.string().min(2, 'Title is too short').max(120).trim(),
  totalAmount: rupees,
  category: z.enum(CATEGORIES).default('Misc'),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).default(''),
  receiptImage: z.string().url().nullish(),
  paidBy: z.array(z.object({ userId: objectId, amount: rupees })).min(1, 'At least one payer is required'),
  splitType: z.enum(SPLIT_TYPES),
  participants: z.array(objectId).default([]),
  exact: z.array(z.object({ userId: objectId, share: z.number().int().nonnegative() })).default([]),
  percentages: z.array(z.object({ userId: objectId, percent: z.number().min(0).max(100) })).default([]),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        qty: z.number().positive().default(1),
        price: z.number().nonnegative(),
        sharedBy: z.array(objectId).default([]),
      }),
    )
    .default([]),
};

export const createExpenseSchema = z.object(base);
export const updateExpenseSchema = z.object(base).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(CATEGORIES).optional(),
  payer: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const groupParamsSchema = z.object({ id: objectId });
export const expenseParamsSchema = z.object({ expenseId: objectId });
