import { z } from 'zod';
import { CATEGORIES } from '../models/GroupExpense.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Month must look like 2026-09');

export const monthlyQuerySchema = z.object({ month: month.optional() });
export const trendsQuerySchema = z.object({ months: z.coerce.number().int().min(2).max(24).default(6) });
export const groupParamsSchema = z.object({ id: objectId });

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  scope: z.enum(['transactions', 'group']).default('transactions'),
  groupId: objectId.optional(),
  month: month.optional(),
  category: z.enum(CATEGORIES).optional(),
}).refine((v) => v.scope !== 'group' || Boolean(v.groupId), {
  message: 'groupId is required to export a group',
  path: ['groupId'],
});

export const notificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationParamsSchema = z.object({ notificationId: objectId });
