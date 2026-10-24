import rateLimit from 'express-rate-limit';

const base = (windowMinutes, max, code, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code, message } },
  });

/**
 * Blanket ceiling on the whole API. Per IP, and a whole classroom can sit behind
 * one IP: 30 people × a few page loads × ~5 calls each passes 600 in minutes.
 */
export const globalLimiter = base(15, 3000, 'RATE_LIMITED', 'Too many requests. Slow down and try again shortly.');

/**
 * Receipt scanning calls a paid vision API, so it gets its own much tighter
 * budget — an abused endpoint here costs real money, not just CPU.
 */
export const scanLimiter = base(60, 30, 'SCAN_RATE_LIMITED', 'You have scanned a lot of receipts this hour. Try again later.');

/** Exports render PDFs and workbooks in-process. */
export const exportLimiter = base(15, 40, 'EXPORT_RATE_LIMITED', 'Too many exports. Try again in a few minutes.');
