import { z } from 'zod';

const email = z.string().email('Enter a valid email').toLowerCase().trim();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createGroupSchema = z.object({
  title: z.string().min(2, 'Group name is too short').max(80).trim(),
  description: z.string().max(500).default(''),
  type: z.enum(['trip', 'home', 'event', 'other']).default('trip'),
  baseCurrency: z.string().length(3).default('PKR'),
  tags: z.array(z.string().max(30)).max(10).default([]),
  startDate: z.coerce.date().nullish(),
  memberEmails: z.array(email).max(50).default([]),
  settings: z
    .object({ simplifyDebts: z.boolean().default(true), anyoneCanEdit: z.boolean().default(false) })
    .default({}),
});

export const updateGroupSchema = z.object({
  title: z.string().min(2).max(80).trim().optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['trip', 'home', 'event', 'other']).optional(),
  baseCurrency: z.string().length(3).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  startDate: z.coerce.date().nullish(),
  status: z.enum(['ACTIVE', 'SETTLED']).optional(),
  settings: z.object({ simplifyDebts: z.boolean().optional(), anyoneCanEdit: z.boolean().optional() }).optional(),
});

// Invite by email address, or add an existing account straight from search.
export const inviteMemberSchema = z
  .object({
    email: email.optional(),
    userId: objectId.optional(),
    role: z.enum(['admin', 'member']).default('member'),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.userId), {
    message: 'Pick a person or type an email address',
    path: ['email'],
  });

export const groupParamsSchema = z.object({ id: objectId });
export const memberParamsSchema = z.object({ id: objectId, userId: objectId });
export const joinParamsSchema = z.object({ inviteToken: z.string().min(20, 'Invalid invite link') });
export const joinCodeParamsSchema = z.object({ joinCode: z.string().min(6).max(12).trim() });
export const memberIdParamsSchema = z.object({ id: objectId, memberId: objectId });
