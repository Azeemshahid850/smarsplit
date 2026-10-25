import { Router } from 'express';
import multer from 'multer';

import * as ctrl from '../controllers/prices.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/ApiError.js';
import { upsertPriceSchema, priceParamsSchema } from './prices.schemas.js';

const router = Router();

// Spreadsheets are small; keep them in memory and decide by extension, since
// browsers disagree on the MIME type for .csv and .xlsx.
const sheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /\.(xlsx|csv)$/i.test(file.originalname) ? cb(null, true) : cb(ApiError.badRequest('Upload an .xlsx or .csv file', 'BAD_FILE_TYPE')),
});

router.get('/prices', requireAuth, asyncHandler(ctrl.listPrices));
router.get('/prices/export', requireAuth, asyncHandler(ctrl.exportPrices));
router.post('/prices/import', requireAuth, requireSuperAdmin, sheet.single('file'), asyncHandler(ctrl.importPrices));
router.post('/prices/seed', requireAuth, requireSuperAdmin, asyncHandler(ctrl.seedDefaults));
router.post('/prices', requireAuth, requireSuperAdmin, validate(upsertPriceSchema), asyncHandler(ctrl.upsertPrice));
router.delete(
  '/prices/:priceId',
  requireAuth,
  requireSuperAdmin,
  validate(priceParamsSchema, 'params'),
  asyncHandler(ctrl.deletePrice),
);

export default router;
