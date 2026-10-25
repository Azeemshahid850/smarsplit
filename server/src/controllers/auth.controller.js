import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

import { User } from '../models/User.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { sendPasswordResetMail, isMailConfigured } from '../services/mailer.js';
import {
  REFRESH_COOKIE,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  setRefreshCookie,
  clearRefreshCookie,
} from '../services/token.js';

const BCRYPT_COST = 12;
const RESET_TTL_MS = 30 * 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function issueSession(res, user) {
  const { token, expiresAt } = await issueRefreshToken(user._id);
  setRefreshCookie(res, token, expiresAt);
  return { user: user.toPublic(), accessToken: signAccessToken(user) };
}

export async function register(req, res) {
  const { name, email, password, defaultCurrency } = req.body;

  if (await User.exists({ email })) throw ApiError.conflict('Email already registered', 'EMAIL_TAKEN');

  const user = await User.create({
    name,
    email,
    defaultCurrency,
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
  });

  ok(res, await issueSession(res, user), 201);
}

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid email or password', 'BAD_CREDENTIALS');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password', 'BAD_CREDENTIALS');
  }

  ok(res, await issueSession(res, user));
}

export async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token', 'NO_REFRESH_TOKEN');

  const rotated = await rotateRefreshToken(token);
  if (rotated.error) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized(
      rotated.error === 'REUSED' ? 'Refresh token reuse detected — all sessions revoked' : 'Refresh token invalid',
      rotated.error === 'REUSED' ? 'TOKEN_REUSED' : 'BAD_REFRESH_TOKEN',
    );
  }

  const user = await User.findById(rotated.userId);
  if (!user) throw ApiError.unauthorized('User no longer exists', 'USER_GONE');

  setRefreshCookie(res, rotated.token, rotated.expiresAt);
  ok(res, { user: user.toPublic(), accessToken: signAccessToken(user) });
}

export async function logout(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  clearRefreshCookie(res);
  ok(res, { loggedOut: true });
}

export async function me(req, res) {
  ok(res, { user: req.user.toPublic() });
}

export async function updateProfile(req, res) {
  const { notifications, ...rest } = req.body;

  Object.assign(req.user, rest);
  if (notifications) Object.assign(req.user.notifications, notifications);
  await req.user.save();

  ok(res, { user: req.user.toPublic() });
}

/**
 * Changing a password proves ownership with the current one, then revokes every
 * other session — the same rule the reset flow follows.
 */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (user.passwordHash) {
    if (!currentPassword) throw ApiError.badRequest('Enter your current password', 'CURRENT_PASSWORD_REQUIRED');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw ApiError.unauthorized('That current password is not right', 'BAD_CREDENTIALS');
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();

  await revokeAllForUser(user._id);
  const { token, expiresAt } = await issueRefreshToken(user._id);
  setRefreshCookie(res, token, expiresAt);

  ok(res, { user: user.toPublic(), accessToken: signAccessToken(user), message: 'Password updated — other devices were signed out' });
}

export async function google(req, res) {
  const { code, idToken } = req.body;
  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  let credential = idToken;
  if (!credential) {
    const { tokens } = await client.getToken(code).catch(() => {
      throw ApiError.unauthorized('Google code exchange failed', 'GOOGLE_EXCHANGE_FAILED');
    });
    credential = tokens.id_token;
  }

  const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID }).catch(() => {
    throw ApiError.unauthorized('Google token invalid', 'GOOGLE_TOKEN_INVALID');
  });
  const payload = ticket.getPayload();
  if (!payload?.email_verified) throw ApiError.unauthorized('Google email not verified', 'GOOGLE_EMAIL_UNVERIFIED');

  // Find-or-create, and link googleId to an existing password account.
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });
  if (!user) {
    user = await User.create({
      name: payload.name || payload.email.split('@')[0],
      email: payload.email,
      googleId: payload.sub,
      avatarUrl: payload.picture || null,
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
    await user.save();
  }

  ok(res, await issueSession(res, user));
}

export async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Always the same response — never reveal whether the email exists.
  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(raw);
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS);
    await user.save();
    const base = process.env.CLIENT_URL || 'http://localhost:5173';
    await sendPasswordResetMail(user.email, `${base}/reset-password/${raw}`);
  }

  // Same message either way (no enumeration); the flag lets the UI say when no mail can go out at all.
  ok(res, { message: 'If that email is registered, a reset link is on its way.', mailConfigured: isMailConfigured() });
}

export async function resetPassword(req, res) {
  const user = await User.findOne({
    resetTokenHash: sha256(req.params.token),
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpiresAt');

  if (!user) throw ApiError.badRequest('Reset link is invalid or expired', 'BAD_RESET_TOKEN');

  user.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  await user.save();

  // A password change kills every existing session.
  await revokeAllForUser(user._id);
  clearRefreshCookie(res);

  ok(res, { message: 'Password updated. Please sign in again.' });
}
