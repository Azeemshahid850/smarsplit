import { z } from 'zod';

const rupees = z.number().int('Amounts must be whole rupees').min(0, 'Amounts cannot be negative').default(0);
const tola = z.number().min(0, 'Weight cannot be negative').max(100000).multipleOf(0.01, 'Use at most 2 decimals').default(0);
const ratePerTola = z.number().int('Prices must be whole rupees').positive('Price must be above zero');

export const calculateZakatSchema = z.object({
  cash: rupees,
  bank: rupees,
  goldTola: tola,
  silverTola: tola,
  business: rupees,
  investments: rupees,
  receivables: rupees,
  debts: rupees,
  // Leave out to use the prices an admin saved.
  goldPerTola: ratePerTola.optional(),
  silverPerTola: ratePerTola.optional(),
  nisabBasis: z.enum(['silver', 'gold']).default('silver'),
});

export const metalRatesSchema = z.object({
  goldPerTola: ratePerTola,
  silverPerTola: ratePerTola,
});
