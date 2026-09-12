import { Router } from 'express';

import * as ctrl from '../controllers/categories.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createCategorySchema, categoryParamsSchema } from './categories.schemas.js';

const router = Router();

router.get('/categories', requireAuth, asyncHandler(ctrl.listCategories));
router.post('/categories', requireAuth, validate(createCategorySchema), asyncHandler(ctrl.createCategory));
router.get(
  '/categories/:categoryId/usage',
  requireAuth,
  validate(categoryParamsSchema, 'params'),
  asyncHandler(ctrl.categoryUsageCount),
);
router.delete(
  '/categories/:categoryId',
  requireAuth,
  validate(categoryParamsSchema, 'params'),
  asyncHandler(ctrl.deleteCategory),
);

export default router;
