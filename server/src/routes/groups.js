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
  joinCodeParamsSchema,
  memberIdParamsSchema,
  memberRoleSchema,
} from './groups.schemas.js';

const router = Router();

// requireAuth is attached per route, never with router.use — this router is
// mounted at /api/v1, so a blanket guard would answer 401 for unknown paths.
router.post('/groups', requireAuth, validate(createGroupSchema), asyncHandler(ctrl.createGroup));
router.get('/groups', requireAuth, asyncHandler(ctrl.listGroups));

// Declared before /groups/:id so "invites" is never read as a group id.
router.get('/groups/invites', requireAuth, asyncHandler(ctrl.listInvites));
router.post('/groups/:id/invites/accept', requireAuth, validate(groupParamsSchema, 'params'), asyncHandler(ctrl.acceptInvite));
router.delete('/groups/:id/invites', requireAuth, validate(groupParamsSchema, 'params'), asyncHandler(ctrl.declineInvite));

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

router.patch(
  '/groups/:id/members/:memberId',
  requireAuth,
  validate(memberIdParamsSchema, 'params'),
  validate(memberRoleSchema),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.setMemberRole),
);

router.delete(
  '/groups/:id/members/:userId',
  requireAuth,
  validate(memberParamsSchema, 'params'),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.removeMember),
);

// No auth: whoever holds the link can see what it opens before signing up.
router.get('/join/:inviteToken', validate(joinParamsSchema, 'params'), asyncHandler(ctrl.previewInvite));
router.post('/join/:inviteToken', requireAuth, validate(joinParamsSchema, 'params'), asyncHandler(ctrl.joinGroup));

// Share-code flow: anyone with the code can ask, an admin decides.
router.get(
  '/join-request/:joinCode',
  requireAuth,
  validate(joinCodeParamsSchema, 'params'),
  asyncHandler(ctrl.previewByCode),
);
router.post(
  '/join-request/:joinCode',
  requireAuth,
  validate(joinCodeParamsSchema, 'params'),
  asyncHandler(ctrl.requestToJoin),
);

router.patch(
  '/groups/:id/members/:memberId/approve',
  requireAuth,
  validate(memberIdParamsSchema, 'params'),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.approveMember),
);

router.post(
  '/groups/:id/members/:memberId/resend',
  requireAuth,
  validate(memberIdParamsSchema, 'params'),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.resendInvite),
);

router.post(
  '/groups/:id/join-code/rotate',
  requireAuth,
  validate(groupParamsSchema, 'params'),
  asyncHandler(requireMember),
  requireAdmin,
  asyncHandler(ctrl.rotateJoinCode),
);

export default router;
