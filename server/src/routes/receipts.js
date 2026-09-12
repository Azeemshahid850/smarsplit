import { Router } from 'express';
import multer from 'multer';

import * as ctrl from '../controllers/receipts.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../middleware/ApiError.js';
import { scanLimiter } from '../middleware/rateLimits.js';
import { receiptParamsSchema, itemParamsSchema, updateItemSchema, addItemSchema, commitSchema } from './receipts.schemas.js';

// In memory: the buffer goes straight to Cloudinary and to the OCR call, so
// nothing untrusted ever touches the disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(ApiError.badRequest('Only image files can be scanned', 'BAD_FILE_TYPE')),
});

const router = Router();

router.post('/receipts/scan', requireAuth, scanLimiter, upload.single('image'), asyncHandler(ctrl.scanReceipt));
router.get('/receipts', requireAuth, asyncHandler(ctrl.listReceipts));
router.get('/receipts/:receiptId', requireAuth, validate(receiptParamsSchema, 'params'), asyncHandler(ctrl.getReceipt));

router.post(
  '/receipts/:receiptId/items',
  requireAuth,
  validate(receiptParamsSchema, 'params'),
  validate(addItemSchema),
  asyncHandler(ctrl.addItem),
);
router.patch(
  '/receipts/:receiptId/items/:index',
  requireAuth,
  validate(itemParamsSchema, 'params'),
  validate(updateItemSchema),
  asyncHandler(ctrl.updateItem),
);
router.delete(
  '/receipts/:receiptId/items/:index',
  requireAuth,
  validate(itemParamsSchema, 'params'),
  asyncHandler(ctrl.removeItem),
);

router.post(
  '/receipts/:receiptId/commit',
  requireAuth,
  validate(receiptParamsSchema, 'params'),
  validate(commitSchema),
  asyncHandler(ctrl.commitReceipt),
);

export default router;
