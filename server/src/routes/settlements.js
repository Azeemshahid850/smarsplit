import { Router } from 'express';

import * as ctrl from '../controllers/settlements.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireMember } from '../middleware/membership.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { groupParamsSchema, settlementParamsSchema, payBodySchema } from './settlements.schemas.js';

const router = Router();

router.post(
  '/groups/:id/settle/preview',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.previewSettlement),
);

router.post(
  '/groups/:id/settle',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.recordSettlement),
);

router.get(
  '/groups/:id/settlements',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.listSettlements),
);

router.patch(
  '/settlements/:settlementId/pay',
  requireAuth,
  validate(settlementParamsSchema, 'params'),
  validate(payBodySchema),
  asyncHandler(ctrl.markPaid),
);

export default router;
