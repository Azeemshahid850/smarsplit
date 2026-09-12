import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name is too short')
    .max(30, 'Keep it under 30 characters')
    .trim()
    // Plain words only — the name is used as a label everywhere, including exports.
    .regex(/^[\p{L}\p{N} &'/-]+$/u, 'Use letters, numbers, spaces and & \' / - only'),
});

export const categoryParamsSchema = z.object({ categoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });
