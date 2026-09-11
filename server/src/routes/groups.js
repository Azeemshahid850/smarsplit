import { Router } from 'express';

import * as ctrl from '../controllers/groups.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireMember, requireAdmin } from '../middleware/membership.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  groupParamsSchema,
  memberParamsSchema,
  joinParamsSchema,
} from './groups.schemas.js';

const router = Router();

// requireAuth is attached per route, never with router.use — this router is
// mounted at /api/v1, so a blanket guard would answer 401 for unknown paths.
router.post('/groups', requireAuth, validate(createGroupSchema), asyncHandler(ctrl.createGroup));
router.get('/groups', requireAuth, asyncHandler(ctrl.listGroups));

router.get(
  '/groups/:id',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  asyncHandler(ctrl.getGroup),
);

router.patch(
  '/groups/:id',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  validate(updateGroupSchema),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.updateGroup),
);

router.post(
  '/groups/:id/members',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  validate(inviteMemberSchema),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.inviteMember),
);

router.delete(
  '/groups/:id/members/:userId',
  requireAuth,
  validate(memberParamsSchema, 'params'),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.removeMember),
);

router.post('/join/:inviteToken', requireAuth, validate(joinParamsSchema, 'params'), asyncHandler(ctrl.joinGroup));

export default router;
