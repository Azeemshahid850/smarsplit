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
}).refine((v) => v.code || v.idToken, { message: 'code or idToken is required' });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });

export const resetParamsSchema = z.object({ token: z.string().min(20, 'Invalid reset token') });
