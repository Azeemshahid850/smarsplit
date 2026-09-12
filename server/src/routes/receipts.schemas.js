import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const receiptParamsSchema = z.object({ receiptId: objectId });
export const itemParamsSchema = z.object({ receiptId: objectId, index: z.coerce.number().int().min(0) });

export const updateItemSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  qty: z.number().positive().optional(),
  price: z.number().int().nonnegative().optional(),
});

export const addItemSchema = z.object({
  name: z.string().min(1).max(80),
  qty: z.number().positive().default(1),
  price: z.number().int().nonnegative(),
});

export const commitSchema = z
  .object({
    target: z.enum(['personal', 'groupExpense']),
    groupId: objectId.optional(),
    category: z.string().optional(),
    paymentMethod: z.string().optional(),
  })
  .refine((value) => value.target !== 'groupExpense' || Boolean(value.groupId), {
    message: 'groupId is required when committing to a group expense',
    path: ['groupId'],
  });
