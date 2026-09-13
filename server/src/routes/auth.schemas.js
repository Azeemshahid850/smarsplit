import { z } from 'zod';

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().email('Enter a valid email').toLowerCase().trim();

export const registerSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(80).trim(),
  email,
  password,
  defaultCurrency: z.string().length(3).default('PKR'),
});

export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });

export const googleSchema = z.object({
  code: z.string().min(1).optional(),
  idToken: z.string().min(1).optional(),
}).refine((value) => value.code || value.idToken, { message: 'code or idToken is required' });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });

export const resetParamsSchema = z.object({ token: z.string().min(20, 'Invalid reset token') });

export const updateProfileSchema = z
  .object({
    name: z.string().min(2, 'Name is too short').max(80).trim().optional(),
    avatarUrl: z.string().url('Enter a valid image URL').max(500).nullish(),
    defaultCurrency: z.string().length(3, 'Use a 3-letter code like PKR').toUpperCase().optional(),
    notifications: z
      .object({
        email: z.boolean().optional(),
        groupActivity: z.boolean().optional(),
        budgetAlerts: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export const changePasswordSchema = z.object({
  // Absent only for an account created through Google that has no password yet.
  currentPassword: z.string().min(1).optional(),
  newPassword: password,
});
