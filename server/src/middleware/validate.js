import { ApiError } from './ApiError.js';

// validate(schema) -> validates req.body by default; pass 'query' or 'params' for others.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || source}: ${i.message}`)
      .join('; ');
    return next(ApiError.badRequest(detail, 'VALIDATION_ERROR'));
  }
  // Express 5 exposes req.query via a getter, so it cannot be assigned.
  if (source === 'query') {
    Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
  } else {
    req[source] = result.data;
  }
  next();
};
