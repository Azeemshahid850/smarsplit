import { z } from 'zod';
import { SPLIT_TYPES } from '../models/GroupExpense.js';
import { CURRENCIES } from '../services/fx.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
// Whole rupees, or up to 2 decimals in a foreign currency — checked by moneyFits below.
const amount = z.number().positive('Amount must be above zero');
const currency = z.enum(CURRENCIES);

const base = {
  title: z.string().min(2, 'Title is too short').max(120).trim(),
  totalAmount: amount,
  category: z.string().min(1).max(30).trim().default('Misc'),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).default(''),
  receiptImage: z.string().url().nullish(),
  paidBy: z.array(z.object({ userId: objectId, amount })).min(1, 'At least one payer is required'),
  splitType: z.enum(SPLIT_TYPES),
  participants: z.array(objectId).default([]),
  exact: z.array(z.object({ userId: objectId, share: z.number().nonnegative() })).default([]),
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

const atMostTwoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

// PKR amounts are whole rupees; foreign ones may carry paisa-style decimals and
// are converted to whole rupees by the controller.
function moneyFits(body, ctx) {
  const inRupees = (body.currency ?? 'PKR') === 'PKR';
  const check = (value, path) => {
    if (value === undefined) return;
    if (inRupees ? Number.isInteger(value) : atMostTwoDecimals(value)) return;
    ctx.addIssue({ code: 'custom', path, message: inRupees ? 'Amounts must be whole rupees' : 'Amounts can have at most 2 decimals' });
  };
  check(body.totalAmount, ['totalAmount']);
  body.paidBy?.forEach((payerEntry, index) => check(payerEntry.amount, ['paidBy', index, 'amount']));
  body.exact?.forEach((exactEntry, index) => check(exactEntry.share, ['exact', index, 'share']));
  if (!inRupees) body.items?.forEach((item, index) => check(item.price, ['items', index, 'price']));
}

// currency defaults to PKR on create only: a partial update without it must not
// be mistaken for "these amounts are now in rupees".
export const createExpenseSchema = z.object({ ...base, currency: currency.default('PKR') }).superRefine(moneyFits);
export const updateExpenseSchema = z
  .object({ ...base, currency })
  .partial()
  .superRefine(moneyFits)
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')
  .refine((value) => value.currency === undefined || (value.totalAmount !== undefined && value.paidBy !== undefined), {
    message: 'Send the amount and payers together with the currency',
    path: ['currency'],
  });

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().min(1).max(30).trim().optional(),
  payer: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const groupParamsSchema = z.object({ id: objectId });
export const expenseParamsSchema = z.object({ expenseId: objectId });
