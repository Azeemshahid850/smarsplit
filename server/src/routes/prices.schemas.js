import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const upsertPriceSchema = z.object({
  canonicalName: z.string().min(2, 'Product name is too short').max(80).trim(),
  platform: z.string().min(2, 'Store name is too short').max(40).trim().toLowerCase(),
  price: z.number().int('Whole rupees only').positive('Price must be above zero'),
  aliases: z.array(z.string().min(1).max(60).trim().toLowerCase()).max(20).default([]),
  size: z.number().positive().nullish(),
  unit: z.enum(['g', 'kg', 'ml', 'L', 'pcs']).nullish(),
  url: z.string().url('Enter a full link').max(500).nullish(),
});

export const priceParamsSchema = z.object({ priceId: objectId });
