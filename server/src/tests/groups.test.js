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
    const byEmail = Object.fromEntries(group.members.map((memberRow) => [memberRow.email, memberRow]));
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

    expect(mine.body.data.groups.map((groupRow) => groupRow.title)).toEqual(['Flat 3B', 'Murree Trip']);
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
    expect(joined.body.data.group.members.find((memberRow) => memberRow.email === 'newbie@demo.pk').status).toBe('active');

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

describe('invitations inbox', () => {
  const auth = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);

  it('previews an invite link without signing in', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['later@demo.pk'] });
    const link = (await request(app).get(`${api}/groups/${group.id}`).use(auth(owner))).body.data.group.members.find(
      (memberRow) => memberRow.email === 'later@demo.pk',
    ).joinLink;

    const res = await request(app).get(`${api}/join/${link.split('/join/')[1]}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'later@demo.pk', inviterName: owner.name, group: { title: 'Murree Trip' } });
    expect(JSON.stringify(res.body)).not.toMatch(/inviteToken/);
  });

  it('lists invites to my email and requests I sent, then accepts one', async () => {
    const owner = await makeUser();
    const invited = await makeGroup(owner, { title: 'Invited', memberEmails: ['later@demo.pk'] });
    const asked = await makeGroup(owner, { title: 'Asked' });
    const later = await makeUser({ email: 'later@demo.pk' });

    const code = (await request(app).get(`${api}/groups/${asked.id}`).use(auth(owner))).body.data.group.joinCode;
    await request(app).post(`${api}/join-request/${code}`).use(auth(later));

    const inbox = await request(app).get(`${api}/groups/invites`).use(auth(later));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.invites.map((inviteRow) => [inviteRow.title, inviteRow.status])).toEqual([
      ['Asked', 'requested'],
      ['Invited', 'pending'],
    ]);
    expect(inbox.body.data.invites[1].invitedBy).toBe(owner.name);

    const accepted = await request(app).post(`${api}/groups/${invited.id}/invites/accept`).use(auth(later));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.group.members.find((memberRow) => memberRow.email === 'later@demo.pk').status).toBe('active');

    const groups = await request(app).get(`${api}/groups`).use(auth(later));
    expect(groups.body.data.groups.map((groupRow) => groupRow.title)).toEqual(['Invited']);

    // Accepting twice, or with no invite, is a 404 — nothing to claim.
    const again = await request(app).post(`${api}/groups/${invited.id}/invites/accept`).use(auth(later));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NO_INVITE');
  });

  it('declines an invite and withdraws a request', async () => {
    const owner = await makeUser();
    const invited = await makeGroup(owner, { memberEmails: ['later@demo.pk'] });
    const asked = await makeGroup(owner, { title: 'Asked' });
    const later = await makeUser({ email: 'later@demo.pk' });
    const code = (await request(app).get(`${api}/groups/${asked.id}`).use(auth(owner))).body.data.group.joinCode;
    await request(app).post(`${api}/join-request/${code}`).use(auth(later));

    expect((await request(app).delete(`${api}/groups/${invited.id}/invites`).use(auth(later))).status).toBe(200);
    expect((await request(app).delete(`${api}/groups/${asked.id}/invites`).use(auth(later))).status).toBe(200);
    expect((await request(app).get(`${api}/groups/invites`).use(auth(later))).body.data.invites).toEqual([]);

    const fromOwner = await request(app).get(`${api}/groups/${invited.id}`).use(auth(owner));
    expect(fromOwner.body.data.group.members).toHaveLength(1);
  });

  it('lets an admin add someone who was invited before they signed up', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['later@demo.pk'] });
    const later = await makeUser({ email: 'later@demo.pk' });

    const res = await request(app).post(`${api}/groups/${group.id}/members`).use(auth(owner)).send({ userId: later.id });
    expect(res.status).toBe(201);
    expect(res.body.data.member).toMatchObject({ email: 'later@demo.pk', status: 'active' });
    expect(res.body.data.joinLink).toBeNull();

    const members = (await request(app).get(`${api}/groups/${group.id}`).use(auth(owner))).body.data.group.members;
    expect(members).toHaveLength(2); // the pending row was claimed, not duplicated
  });
});

describe('PATCH /groups/:id/members/:memberId — roles', () => {
  const auth = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);

  it('promotes and demotes, but never removes the last admin', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    const [ownerRow, friendRow] = group.members;

    const promoted = await request(app).patch(`${api}/groups/${group.id}/members/${friendRow.id}`).use(auth(owner)).send({ role: 'admin' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.member.role).toBe('admin');

    // Two admins now, so the owner may step down.
    const stepDown = await request(app).patch(`${api}/groups/${group.id}/members/${ownerRow.id}`).use(auth(owner)).send({ role: 'member' });
    expect(stepDown.status).toBe(200);

    // The owner is a plain member now — admin actions are refused.
    const refused = await request(app).patch(`${api}/groups/${group.id}/members/${ownerRow.id}`).use(auth(owner)).send({ role: 'admin' });
    expect(refused.status).toBe(403);

    // Friend is the only admin left and cannot demote themself.
    const last = await request(app).patch(`${api}/groups/${group.id}/members/${friendRow.id}`).use(auth(friend)).send({ role: 'member' });
    expect(last.status).toBe(400);
    expect(last.body.error.code).toBe('LAST_ADMIN');
  });

  it('rejects a role change for someone who has not joined', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['later@demo.pk'] });
    const pending = group.members.find((memberRow) => memberRow.status === 'pending');

    const res = await request(app).patch(`${api}/groups/${group.id}/members/${pending.id}`).use(auth(owner)).send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_ACTIVE');
  });
});
