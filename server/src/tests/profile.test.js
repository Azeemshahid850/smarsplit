import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser } from './helpers.js';

const api = '/api/v1';
const patch = (user, body) => request(app).patch(`${api}/auth/me`).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const changePassword = (user, body) =>
  request(app).post(`${api}/auth/change-password`).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const login = (email, password) => request(app).post(`${api}/auth/login`).send({ email, password });

describe('PATCH /auth/me', () => {
  it('updates the name, avatar and default currency', async () => {
    const user = await makeUser({ name: 'Azeem Shahid' });

    const response = await patch(user, {
      name: 'Azeem S. Shahid',
      avatarUrl: 'https://example.com/me.png',
      defaultCurrency: 'usd',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      name: 'Azeem S. Shahid',
      avatarUrl: 'https://example.com/me.png',
      defaultCurrency: 'USD', // normalised
    });
  });

  it('merges notification toggles without clearing the others', async () => {
    const user = await makeUser();
    const response = await patch(user, { notifications: { budgetAlerts: false } });

    expect(response.body.data.user.notifications).toEqual({ email: true, groupActivity: true, budgetAlerts: false });
  });

  it('rejects a bad name, currency or avatar URL, and an empty body', async () => {
    const user = await makeUser();

    expect((await patch(user, { name: 'x' })).status).toBe(400);
    expect((await patch(user, { defaultCurrency: 'RUPEES' })).status).toBe(400);
    expect((await patch(user, { avatarUrl: 'not-a-url' })).status).toBe(400);
    expect((await patch(user, {})).status).toBe(400);
  });

  it('never lets the email or password be changed here', async () => {
    const user = await makeUser();
    const response = await patch(user, { email: 'someone@else.pk', passwordHash: 'x' });

    expect(response.status).toBe(400); // no known field to update
    expect((await request(app).get(`${api}/auth/me`).set('Authorization', `Bearer ${user.accessToken}`)).body.data.user.email).toBe(
      user.email,
    );
  });

  it('401s without a token', async () => {
    expect((await request(app).patch(`${api}/auth/me`).send({ name: 'Nobody' })).status).toBe(401);
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and lets the new one sign in', async () => {
    const user = await makeUser();

    const response = await changePassword(user, { currentPassword: 'Demo1234', newPassword: 'BrandNew4321' });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    expect((await login(user.email, 'BrandNew4321')).status).toBe(200);
    expect((await login(user.email, 'Demo1234')).status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const user = await makeUser();
    const response = await changePassword(user, { currentPassword: 'WrongOne123', newPassword: 'BrandNew4321' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('BAD_CREDENTIALS');
    expect((await login(user.email, 'Demo1234')).status).toBe(200); // unchanged
  });

  it('requires the current password when the account has one', async () => {
    const user = await makeUser();
    const response = await changePassword(user, { newPassword: 'BrandNew4321' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CURRENT_PASSWORD_REQUIRED');
  });

  it('rejects a short new password', async () => {
    const user = await makeUser();
    expect((await changePassword(user, { currentPassword: 'Demo1234', newPassword: 'short' })).status).toBe(400);
  });

  it('signs other devices out but keeps this one working', async () => {
    const user = await makeUser();
    const otherDevice = (await login(user.email, 'Demo1234')).headers['set-cookie'].find((cookieHeader) =>
      cookieHeader.startsWith('rt='),
    );

    const response = await changePassword(user, { currentPassword: 'Demo1234', newPassword: 'BrandNew4321' });
    const thisDevice = response.headers['set-cookie'].find((cookieHeader) => cookieHeader.startsWith('rt='));

    expect((await request(app).post(`${api}/auth/refresh`).set('Cookie', otherDevice)).status).toBe(401);
    expect((await request(app).post(`${api}/auth/refresh`).set('Cookie', thisDevice)).status).toBe(200);
  });
});
