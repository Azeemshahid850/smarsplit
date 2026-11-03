import { z } from 'zod';
import { LIVE_STORES } from '../models/BenchmarkPrice.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const upsertPriceSchema = z.object({
  canonicalName: z.string().min(2, 'Product name is too short').max(80).trim(),
  platform: z
    .string()
    .trim()
    .toLowerCase()
    .refine((store) => LIVE_STORES.includes(store), `Pick one of the stores the app reads: ${LIVE_STORES.join(', ')}`),
  price: z.number().int('Whole rupees only').positive('Price must be above zero'),
  aliases: z.array(z.string().min(1).max(60).trim().toLowerCase()).max(20).default([]),
  size: z.number().positive().nullish(),
  unit: z.enum(['g', 'kg', 'ml', 'L', 'pcs']).nullish(),
  url: z.string().url('Enter a full link').max(500).nullish(),
});

export const priceParamsSchema = z.object({ priceId: objectId });
