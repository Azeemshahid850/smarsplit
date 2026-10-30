import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ok.js';
import { CURRENCIES, SOURCE, currentRates } from '../services/fx.js';

const router = Router();

// Rupees per one unit of each supported currency, for the Add Expense preview.
router.get(
  '/fx/rates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rates, updatedAt, stale } = await currentRates();
    ok(res, { base: 'PKR', currencies: CURRENCIES, rates, updatedAt, stale, source: SOURCE });
  }),
);

export default router;
