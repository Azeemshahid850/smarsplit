import { ApiError } from './ApiError.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // multer signals upload problems with its own error class.
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That image is larger than 8MB' : err.message;
    return res.status(400).json({ success: false, error: { code: 'UPLOAD_FAILED', message } });
  }

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status === 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong'
    : err.message;

  if (status === 500) console.error(err);

  res.status(status).json({ success: false, error: { code, message } });
}
