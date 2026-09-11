import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';

const api = '/api/v1';

describe('POST /groups', () => {
  it('creates a group with the creator as active admin', async () => {
    const owner = await makeUser();
    const res = await request(app)
      .post(`${api}/groups`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Murree Trip', type: 'trip', description: 'Northern tour', tags: ['trip'] });

    expect(res.status).toBe(201);
    const { group } = res.body.data;
    expect(group.title).toBe('Murree Trip');
    expect(group.baseCurrency).toBe('PKR');
    expect(group.status).toBe('ACTIVE');
    expect(group.settings).toEqual({ simplifyDebts: true, anyoneCanEdit: false });
    expect(group.members).toHaveLength(1);
    expect(group.members[0]).toMatchObject({ email: owner.email, role: 'admin', status: 'active' });
  });

  it('adds existing accounts as active members and strangers as pending', async () => {
    const owner = await makeUser();
    const friend = await makeUser();

    const group = await makeGroup(owner, { memberEmails: [friend.email, 'stranger@demo.pk', owner.email] });

    expect(group.members).toHaveLength(3); // owner deduped, not added twice
    const byEmail = Object.fromEntries(group.members.map((m) => [m.email, m]));
    expect(byEmail[friend.email].status).toBe('active');
    expect(byEmail['stranger@demo.pk'].status).toBe('pending');
    expect(JSON.stringify(group)).not.toMatch(/inviteToken/);
  });

  it('rejects a short title', async () => {
    const owner = await makeUser();
    const res = await request(app)
      .post(`${api}/groups`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401s without a token', async () => {
    const res = await request(app).post(`${api}/groups`).send({ title: 'Murree Trip' });
    expect(res.status).toBe(401);
  });
});

describe('GET /groups', () => {
  it('lists only groups where I am an active member', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    await makeGroup(owner, { title: 'Murree Trip' });
    await makeGroup(owner, { title: 'Flat 3B' });

    const mine = await request(app).get(`${api}/groups`).set('Authorization', `Bearer ${owner.accessToken}`);
    const theirs = await request(app).get(`${api}/groups`).set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(mine.body.data.groups.map((g) => g.title)).toEqual(['Flat 3B', 'Murree Trip']);
    expect(theirs.body.data.groups).toEqual([]);
  });

  it('does not list a group I was only invited to as pending', async () => {
    const owner = await makeUser();
    await makeGroup(owner, { memberEmails: ['later@demo.pk'] });
    const later = await makeUser({ email: 'later@demo.pk' });

    const res = await request(app).get(`${api}/groups`).set('Authorization', `Bearer ${later.accessToken}`);
    expect(res.body.data.groups).toEqual([]);
  });
});

describe('group authorization — every route rejects a non-member', () => {
  it('403s a non-member on read, update, invite and remove', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner);
    const bearer = `Bearer ${outsider.accessToken}`;

    const calls = [
      request(app).get(`${api}/groups/${group.id}`).set('Authorization', bearer),
      request(app).patch(`${api}/groups/${group.id}`).set('Authorization', bearer).send({ title: 'Hijacked' }),
      request(app).post(`${api}/groups/${group.id}/members`).set('Authorization', bearer).send({ email: 'x@demo.pk' }),
      request(app)
        .delete(`${api}/groups/${group.id}/members/${group.members[0].userId}`)
        .set('Authorization', bearer),
    ];

    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_A_MEMBER');
    }
  });

  it('404s an unknown group id without leaking existence', async () => {
    const user = await makeUser();
    const res = await request(app)
      .get(`${api}/groups/64b7f0c2b1a2c3d4e5f60718`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });

  it('403s a plain member trying admin-only actions', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    const bearer = `Bearer ${friend.accessToken}`;

    const patch = await request(app).patch(`${api}/groups/${group.id}`).set('Authorization', bearer).send({ title: 'Nope' });
    const invite = await request(app)
      .post(`${api}/groups/${group.id}/members`)
      .set('Authorization', bearer)
      .send({ email: 'x@demo.pk' });

    expect([patch.status, invite.status]).toEqual([403, 403]);
    expect(patch.body.error.code).toBe('NOT_ADMIN');
  });

  it('lets a plain member read the group', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });

    const res = await request(app).get(`${api}/groups/${group.id}`).set('Authorization', `Bearer ${friend.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.group.members).toHaveLength(2);
  });
});

describe('invites and joining', () => {
  it('returns a join link for an unknown email and consumes it on join', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const invite = await request(app)
      .post(`${api}/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'newbie@demo.pk' });

    expect(invite.status).toBe(201);
    expect(invite.body.data.member.status).toBe('pending');
    expect(invite.body.data.joinLink).toMatch(/\/join\/[a-f0-9]{48}$/);

    const token = invite.body.data.joinLink.split('/join/')[1];
    const newbie = await makeUser({ email: 'newbie@demo.pk' });

    const joined = await request(app).post(`${api}/join/${token}`).set('Authorization', `Bearer ${newbie.accessToken}`);
    expect(joined.status).toBe(200);
    expect(joined.body.data.group.members.find((m) => m.email === 'newbie@demo.pk').status).toBe('active');

    // Single use.
    const replay = await request(app).post(`${api}/join/${token}`).set('Authorization', `Bearer ${newbie.accessToken}`);
    expect(replay.status).toBe(404);
    expect(replay.body.error.code).toBe('BAD_INVITE');
  });

  it('adds an existing account straight to active with no link needed', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner);

    const res = await request(app)
      .post(`${api}/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: friend.email });

    expect(res.body.data.member.status).toBe('active');
    expect(res.body.data.joinLink).toBeNull();
  });

  it('rejects a duplicate invite', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['dup@demo.pk'] });

    const res = await request(app)
      .post(`${api}/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'dup@demo.pk' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_INVITED');
  });

  it('rejects a garbage invite token', async () => {
    const user = await makeUser();
    const res = await request(app).post(`${api}/join/${'0'.repeat(48)}`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /groups/:id/members/:userId', () => {
  it('removes a member', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });

    const res = await request(app)
      .delete(`${api}/groups/${group.id}/members/${friend.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const after = await request(app).get(`${api}/groups/${group.id}`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(after.body.data.group.members).toHaveLength(1);
  });

  it('refuses to remove the last admin', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const res = await request(app)
      .delete(`${api}/groups/${group.id}/members/${owner.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  });
});

describe('PATCH /groups/:id', () => {
  it('updates fields and merges settings', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const res = await request(app)
      .patch(`${api}/groups/${group.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Northern Tour', settings: { anyoneCanEdit: true } });

    expect(res.body.data.group.title).toBe('Northern Tour');
    expect(res.body.data.group.settings).toEqual({ simplifyDebts: true, anyoneCanEdit: true });
  });
});
