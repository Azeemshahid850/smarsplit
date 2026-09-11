import { ApiError } from './ApiError.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status === 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong'
    : err.message;

  if (status === 500) console.error(err);

  res.status(status).json({ success: false, error: { code, message } });
}
