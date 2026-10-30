import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const rupees = z.number().int('Amounts must be whole rupees').positive('Amount must be above zero');

const goalShape = {
  title: z.string().min(2, 'Give the goal a name').max(60).trim(),
  targetAmount: rupees,
  targetDate: z.coerce.date().nullish(),
};

export const createGoalSchema = z
  .object(goalShape)
  .refine((value) => !value.targetDate || value.targetDate > new Date(), {
    message: 'Pick a target date after today',
    path: ['targetDate'],
  });

export const updateGoalSchema = z
  .object(goalShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

// Positive adds money to the goal, negative takes it out.
export const contributionSchema = z.object({
  amount: z.number().int('Amounts must be whole rupees').refine((value) => value !== 0, 'Amount cannot be zero'),
  note: z.string().max(120).trim().default(''),
  date: z.coerce.date().default(() => new Date()),
});

export const goalParamsSchema = z.object({ goalId: objectId });
export const contributionParamsSchema = z.object({ goalId: objectId, contributionId: objectId });
