import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';

const api = '/api/v1';
const as = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe('super admin', () => {
  it('flags listed accounts as admins on their profile, nobody when unset', async () => {
    const plain = await makeUser({ email: 'plain@demo.pk' });
    expect(plain.isAdmin).toBe(false);

    process.env.ADMIN_EMAILS = 'Boss@demo.pk';
    const boss = await makeUser({ email: 'boss@demo.pk' });
    expect(boss.isAdmin).toBe(true);
    const me = await request(app).get(`${api}/auth/me`).use(as(boss));
    expect(me.body.data.user.isAdmin).toBe(true);
  });

  it('serves the overview to admins only', async () => {
    process.env.ADMIN_EMAILS = 'boss@demo.pk';
    const boss = await makeUser({ email: 'boss@demo.pk' });
    const sara = await makeUser({ name: 'Sara Khan' });
    await makeGroup(sara, { title: 'Murree Trip', memberEmails: [boss.email, 'later@demo.pk'] });

    const denied = await request(app).get(`${api}/admin/overview`).use(as(sara));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_SUPER_ADMIN');

    const res = await request(app).get(`${api}/admin/overview`).use(as(boss));
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ users: 2, groups: 1, expenses: 0, prices: 0, stores: 0 });
    expect(res.body.data.services.mail).toBe(false);
    expect(res.body.data.groups[0]).toMatchObject({ title: 'Murree Trip', createdBy: 'Sara Khan', memberCount: 2, pendingCount: 1 });
    const saraRow = res.body.data.users.find((userRow) => userRow.email === sara.email);
    expect(saraRow.groups).toBe(1);
  });

  it('loads the bundled catalogue into the price book without touching anything else', async () => {
    process.env.ADMIN_EMAILS = 'boss@demo.pk';
    const boss = await makeUser({ email: 'boss@demo.pk' });
    await BenchmarkPrice.create({ canonicalName: 'Old Thing', aliases: [], price: 1, platform: 'nowhere' });

    const denied = await request(app).post(`${api}/prices/seed`).use(as(await makeUser()));
    expect(denied.status).toBe(403);

    const res = await request(app).post(`${api}/prices/seed`).use(as(boss));
    expect(res.status).toBe(200);
    expect(res.body.data.products).toBe(100);
    expect(await BenchmarkPrice.countDocuments({ canonicalName: 'Old Thing' })).toBe(0);

    const stores = await BenchmarkPrice.distinct('platform');
    expect(stores).toEqual(expect.arrayContaining(['daraz', 'metro', 'imtiaz', 'alfatah', 'carrefour', 'naheed', 'chaseup']));
    expect(await request(app).get(`${api}/auth/me`).use(as(boss)).then((me) => me.status)).toBe(200); // users untouched
  });

  it('forgot-password says when no email can go out', async () => {
    const res = await request(app).post(`${api}/auth/forgot-password`).send({ email: 'anyone@demo.pk' });
    expect(res.status).toBe(200);
    expect(res.body.data.mailConfigured).toBe(false);
  });
});
