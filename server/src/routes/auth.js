import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  registerSchema,
  loginSchema,
  googleSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetParamsSchema,
} from './auth.schemas.js';

const router = Router();

const limit = (max, minutes = 15) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: max,
    skip: () => process.env.NODE_ENV === 'test', // limits off under test
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
  });

router.post('/auth/register', limit(10), validate(registerSchema), asyncHandler(ctrl.register));
router.post('/auth/login', limit(10), validate(loginSchema), asyncHandler(ctrl.login));
router.post('/auth/refresh', limit(60), asyncHandler(ctrl.refresh));
router.post('/auth/logout', asyncHandler(ctrl.logout));
router.get('/auth/me', requireAuth, asyncHandler(ctrl.me));
router.post('/auth/google', limit(20), validate(googleSchema), asyncHandler(ctrl.google));
router.post('/auth/forgot-password', limit(5, 60), validate(forgotPasswordSchema), asyncHandler(ctrl.forgotPassword));
router.post(
  '/auth/reset-password/:token',
  limit(10, 60),
  validate(resetParamsSchema, 'params'),
  validate(resetPasswordSchema),
  asyncHandler(ctrl.resetPassword),
);

export default router;
