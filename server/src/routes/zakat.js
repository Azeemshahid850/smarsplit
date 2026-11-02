import { Router } from 'express';

import * as ctrl from '../controllers/zakat.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateZakatSchema, metalRatesSchema } from './zakat.schemas.js';

const router = Router();

router.get('/zakat', requireAuth, asyncHandler(ctrl.overview));
router.post('/zakat/calculate', requireAuth, validate(calculateZakatSchema), asyncHandler(ctrl.calculate));
router.put('/zakat/rates', requireAuth, requireSuperAdmin, validate(metalRatesSchema), asyncHandler(ctrl.saveRates));

export default router;
