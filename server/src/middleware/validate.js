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
  req[source] = result.data;
  next();
};
