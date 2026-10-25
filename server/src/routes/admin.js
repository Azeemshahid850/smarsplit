import { Router } from 'express';

import * as ctrl from '../controllers/admin.controller.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/admin/overview', requireAuth, requireSuperAdmin, asyncHandler(ctrl.overview));

export default router;
