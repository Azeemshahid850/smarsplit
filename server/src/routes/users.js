import { Router } from 'express';
import { z } from 'zod';

import * as ctrl from '../controllers/users.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const searchSchema = z.object({ q: z.string().min(2, 'Type at least two characters').max(60).trim() });

const router = Router();

router.get('/users/search', requireAuth, validate(searchSchema, 'query'), asyncHandler(ctrl.searchUsers));

export default router;
