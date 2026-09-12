import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const groupParamsSchema = z.object({ id: objectId });
export const settlementParamsSchema = z.object({ settlementId: objectId });
export const payBodySchema = z.object({ isPaid: z.boolean().default(true) });
