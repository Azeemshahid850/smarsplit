import { User } from '../models/User.js';
import { verifyAccessToken } from '../services/token.js';
import { ApiError } from './ApiError.js';

// Verifies the access token and attaches req.user (a User document).
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Missing access token', 'NO_TOKEN'));

  try {
    const { sub } = verifyAccessToken(token);
    const user = await User.findById(sub);
    if (!user) return next(ApiError.unauthorized('User no longer exists', 'USER_GONE'));
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized('Access token invalid or expired', 'TOKEN_EXPIRED'));
  }
}
