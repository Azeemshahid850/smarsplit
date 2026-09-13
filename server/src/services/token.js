import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RefreshToken } from '../models/RefreshToken.js';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);

export const REFRESH_COOKIE = 'rt';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

// Issues a fresh opaque refresh token; only its hash is stored.
export async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 864e5);
  await RefreshToken.create({ userId, tokenHash: hash(token), expiresAt });
  return { token, expiresAt };
}

/**
 * Rotation with reuse detection.
 *
 * Only a token that was *rotated* (it has a replacement) and then presented
 * again is evidence the cookie leaked — that kills every session for the user.
 * A token revoked deliberately, by signing out or changing a password, is
 * simply invalid: treating that as theft would sign the user out of the very
 * session they just created.
 */
export async function rotateRefreshToken(token) {
  const existing = await RefreshToken.findOne({ tokenHash: hash(token) });
  if (!existing) return { error: 'INVALID' };

  if (existing.revokedAt && existing.replacedBy) {
    await RefreshToken.updateMany({ userId: existing.userId, revokedAt: null }, { revokedAt: new Date() });
    return { error: 'REUSED' };
  }

  if (existing.revokedAt || existing.expiresAt < new Date()) return { error: 'INVALID' };

  const next = await issueRefreshToken(existing.userId);
  existing.revokedAt = new Date();
  existing.replacedBy = hash(next.token);
  await existing.save();

  return { userId: existing.userId, ...next };
}

export async function revokeRefreshToken(token) {
  await RefreshToken.updateOne({ tokenHash: hash(token), revokedAt: null }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}
