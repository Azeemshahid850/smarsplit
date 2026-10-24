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
  updateProfileSchema,
  changePasswordSchema,
} from './auth.schemas.js';

const router = Router();

// Per IP — and a classroom, office or hostel shares one public IP, so these
// are sized for a room full of people signing up at once, not one laptop.
const limit = (max, minutes = 15) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: max,
    skip: () => process.env.NODE_ENV === 'test', // limits off under test
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
  });

router.post('/auth/register', limit(50), validate(registerSchema), asyncHandler(ctrl.register));
router.post('/auth/login', limit(60), validate(loginSchema), asyncHandler(ctrl.login));
router.post('/auth/refresh', limit(300), asyncHandler(ctrl.refresh)); // every page load hits this
router.post('/auth/logout', asyncHandler(ctrl.logout));
router.get('/auth/me', requireAuth, asyncHandler(ctrl.me));
router.patch('/auth/me', requireAuth, validate(updateProfileSchema), asyncHandler(ctrl.updateProfile));
router.post(
  '/auth/change-password',
  requireAuth,
  limit(30, 60),
  validate(changePasswordSchema),
  asyncHandler(ctrl.changePassword),
);
router.post('/auth/google', limit(60), validate(googleSchema), asyncHandler(ctrl.google));
router.post('/auth/forgot-password', limit(20, 60), validate(forgotPasswordSchema), asyncHandler(ctrl.forgotPassword));
router.post(
  '/auth/reset-password/:token',
  limit(30, 60),
  validate(resetParamsSchema, 'params'),
  validate(resetPasswordSchema),
  asyncHandler(ctrl.resetPassword),
);

export default router;
