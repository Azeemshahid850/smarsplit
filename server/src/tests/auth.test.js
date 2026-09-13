import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';

const creds = { name: 'Azeem Khan', email: 'azeem@demo.pk', password: 'Demo1234' };

const register = (overrides = {}) => request(app).post('/api/v1/auth/register').send({ ...creds, ...overrides });
const cookieOf = (res) => res.headers['set-cookie'].find((cookieHeader) => cookieHeader.startsWith('rt='));

describe('POST /auth/register', () => {
  it('creates a user, returns access token + refresh cookie, never leaks the hash', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('azeem@demo.pk');
    expect(res.body.data.user.defaultCurrency).toBe('PKR');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it('rejects a duplicate email with 409', async () => {
    await register();
    const res = await register({ name: 'Someone Else' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: { code: 'EMAIL_TAKEN', message: expect.any(String) } });
  });

  it('rejects a short password with a validation error', async () => {
    const res = await register({ password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    await register();
    const res = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401 BAD_CREDENTIALS', async () => {
    await register();
    const res = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: 'WrongPass123' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });

  it('gives an unknown email the same error as a wrong password (no enumeration)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@demo.pk', password: 'Demo1234' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });
});

describe('POST /auth/refresh — rotation', () => {
  it('rotates the cookie and revokes the old token', async () => {
    const first = await register();
    const oldCookie = cookieOf(first);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const newCookie = cookieOf(res);
    expect(newCookie).not.toBe(oldCookie);
    expect(await RefreshToken.countDocuments({ revokedAt: { $ne: null } })).toBe(1);
  });

  it('detects reuse of a rotated token and revokes every session', async () => {
    const first = await register();
    const oldCookie = cookieOf(first);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSED');
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('a token revoked by signing out is invalid, but does NOT kill other sessions', async () => {
    const first = await register();
    const firstCookie = cookieOf(first);

    // A second device signs in.
    const second = await request(app).post(`/api/v1/auth/login`).send({ email: creds.email, password: creds.password });
    const secondCookie = cookieOf(second);

    await request(app).post(`/api/v1/auth/logout`).set('Cookie', firstCookie);

    const replayed = await request(app).post(`/api/v1/auth/refresh`).set('Cookie', firstCookie);
    expect(replayed.status).toBe(401);
    expect(replayed.body.error.code).toBe('BAD_REFRESH_TOKEN'); // not TOKEN_REUSED

    // The other device is untouched.
    expect((await request(app).post(`/api/v1/auth/refresh`).set('Cookie', secondCookie)).status).toBe(200);
  });

  it('401s with no cookie at all', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });
});

describe('GET /auth/me', () => {
  it('returns the current user with a valid access token', async () => {
    const reg = await register();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(creds.email);
  });

  it('reports hasPassword=true for a password account (field is not select-excluded)', async () => {
    const reg = await register();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);

    expect(res.body.data.user.hasPassword).toBe(true);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('401s without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('401s with a garbage token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token so it cannot rotate again', async () => {
    const reg = await register();
    const cookie = cookieOf(reg);

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);

    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});

describe('password reset', () => {
  it('answers identically for known and unknown emails', async () => {
    await register();
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@demo.pk' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets the password with a valid token, kills sessions, and lets the new password log in', async () => {
    const reg = await register();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });

    // Read the raw token the only way a user would: rebuild it from the stored hash side.
    const user = await User.findOne({ email: creds.email }).select('+resetTokenHash');
    expect(user.resetTokenHash).toEqual(expect.any(String));

    // The controller stores sha256(raw); regenerate a raw token by resetting through the known hash.
    const crypto = await import('node:crypto');
    const raw = 'a'.repeat(64);
    user.resetTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await user.save();

    const res = await request(app).post(`/api/v1/auth/reset-password/${raw}`).send({ password: 'NewPass4321' });
    expect(res.status).toBe(200);

    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieOf(reg))).status).toBe(401);

    const relogin = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: 'NewPass4321' });
    expect(relogin.status).toBe(200);

    const oldPass = await request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
    expect(oldPass.status).toBe(401);
  });

  it('rejects an expired reset token', async () => {
    await register();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });

    const crypto = await import('node:crypto');
    const raw = 'b'.repeat(64);
    await User.updateOne(
      { email: creds.email },
      {
        resetTokenHash: crypto.createHash('sha256').update(raw).digest('hex'),
        resetTokenExpiresAt: new Date(Date.now() - 1000),
      },
    );

    const res = await request(app).post(`/api/v1/auth/reset-password/${raw}`).send({ password: 'NewPass4321' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_RESET_TOKEN');
  });
});
