import { Router } from 'express';

import * as ctrl from '../controllers/goals.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createGoalSchema,
  updateGoalSchema,
  contributionSchema,
  goalParamsSchema,
  contributionParamsSchema,
} from './goals.schemas.js';

const router = Router();

router.get('/goals', requireAuth, asyncHandler(ctrl.listGoals));
router.post('/goals', requireAuth, validate(createGoalSchema), asyncHandler(ctrl.createGoal));
router.patch('/goals/:goalId', requireAuth, validate(goalParamsSchema, 'params'), validate(updateGoalSchema), asyncHandler(ctrl.updateGoal));
router.delete('/goals/:goalId', requireAuth, validate(goalParamsSchema, 'params'), asyncHandler(ctrl.deleteGoal));
router.post(
  '/goals/:goalId/contributions',
  requireAuth,
  validate(goalParamsSchema, 'params'),
  validate(contributionSchema),
  asyncHandler(ctrl.addContribution),
);
router.delete(
  '/goals/:goalId/contributions/:contributionId',
  requireAuth,
  validate(contributionParamsSchema, 'params'),
  asyncHandler(ctrl.removeContribution),
);

export default router;
