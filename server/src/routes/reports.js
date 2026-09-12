import { Router } from 'express';

import * as ctrl from '../controllers/reports.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireMember } from '../middleware/membership.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { exportLimiter } from '../middleware/rateLimits.js';
import {
  monthlyQuerySchema,
  trendsQuerySchema,
  groupParamsSchema,
  exportQuerySchema,
  notificationsQuerySchema,
  notificationParamsSchema,
} from './reports.schemas.js';

const router = Router();

router.get(
  '/reports/personal/monthly',
  requireAuth,
  validate(monthlyQuerySchema, 'query'),
  asyncHandler(ctrl.monthlyReport),
);
router.get('/reports/personal/trends', requireAuth, validate(trendsQuerySchema, 'query'), asyncHandler(ctrl.trendsReport));
router.get(
  '/reports/groups/:id/summary',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.groupReport),
);
router.get('/reports/export', requireAuth, exportLimiter, validate(exportQuerySchema, 'query'), asyncHandler(ctrl.exportReport));

router.get('/notifications', requireAuth, validate(notificationsQuerySchema, 'query'), asyncHandler(ctrl.listNotifications));
router.patch(
  '/notifications/:notificationId/read',
  requireAuth,
  validate(notificationParamsSchema, 'params'),
  asyncHandler(ctrl.markNotificationRead),
);
router.patch('/notifications/read-all', requireAuth, asyncHandler(ctrl.markAllRead));

export default router;
