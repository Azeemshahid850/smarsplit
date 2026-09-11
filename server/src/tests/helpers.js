import request from 'supertest';
import app from '../app.js';

// Registers a user and returns { user, accessToken, cookie, auth } for tests.
export async function makeUser(overrides = {}) {
  const seed = Math.random().toString(36).slice(2, 8);
  const body = { name: `User ${seed}`, email: `${seed}@demo.pk`, password: 'Demo1234', ...overrides };
  const res = await request(app).post('/api/v1/auth/register').send(body);

  const accessToken = res.body.data.accessToken;
  return {
    ...res.body.data.user,
    password: body.password,
    accessToken,
    cookie: res.headers['set-cookie'].find((c) => c.startsWith('rt=')),
    auth: (req) => req.set('Authorization', `Bearer ${accessToken}`),
  };
}

export const asUser = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);

export async function makeGroup(owner, body = {}) {
  const res = await request(app)
    .post('/api/v1/groups')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ title: 'Murree Trip', type: 'trip', ...body });
  return res.body.data.group;
}
