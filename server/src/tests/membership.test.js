import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser, makeGroup } from './helpers.js';
import { Group } from '../models/Group.js';

const api = '/api/v1';
const post = (u, url, body) => request(app).post(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const patch = (u, url, body) => request(app).patch(url).set('Authorization', `Bearer ${u.accessToken}`).send(body);
const get = (u, url) => request(app).get(url).set('Authorization', `Bearer ${u.accessToken}`);

describe('invite by email', () => {
  it('returns a join link that stays retrievable on the member row', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const invite = await post(owner, `${api}/groups/${group.id}/members`, { email: 'newbie@demo.pk' });
    expect(invite.status).toBe(201);
    expect(invite.body.data.joinLink).toMatch(/\/join\/[a-f0-9]{48}$/);
    expect(invite.body.data.mailConfigured).toBe(false); // no SMTP in test
    expect(invite.body.data.emailed).toBe(false);

    // The link survives a page reload — it is on the member, not just the response.
    const fetched = await get(owner, `${api}/groups/${group.id}`);
    const pending = fetched.body.data.group.members.find((memberRow) => memberRow.email === 'newbie@demo.pk');
    expect(pending.joinLink).toBe(invite.body.data.joinLink);
    expect(fetched.body.data.group.pendingCount).toBe(1);
  });

  it('resends an invite and hands back the same link', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['newbie@demo.pk'] });
    const member = (await get(owner, `${api}/groups/${group.id}`)).body.data.group.members.find(
      (memberRow) => memberRow.email === 'newbie@demo.pk',
    );

    const res = await post(owner, `${api}/groups/${group.id}/members/${member.id}/resend`);
    expect(res.status).toBe(200);
    expect(res.body.data.joinLink).toBe(member.joinLink);
  });

  it('refuses to resend for someone who already joined', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    const member = (await get(owner, `${api}/groups/${group.id}`)).body.data.group.members.find(
      (memberRow) => memberRow.email === friend.email,
    );

    const res = await post(owner, `${api}/groups/${group.id}/members/${member.id}/resend`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_PENDING');
  });

  it('gives a clearer message for someone already in the group', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });

    const again = await post(owner, `${api}/groups/${group.id}/members`, { email: friend.email });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('They are already in this group');
  });
});

describe('add directly from the people list', () => {
  it('adds an existing account by id, no email typing', async () => {
    const owner = await makeUser();
    const friend = await makeUser({ name: 'Sara Khan' });
    const group = await makeGroup(owner);

    const res = await post(owner, `${api}/groups/${group.id}/members`, { userId: friend.id });

    expect(res.status).toBe(201);
    expect(res.body.data.member).toMatchObject({ name: 'Sara Khan', status: 'active' });
    expect(res.body.data.joinLink).toBeNull();
  });

  it('rejects a request with neither an email nor a userId', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const res = await post(owner, `${api}/groups/${group.id}/members`, { role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch('Pick a person or type an email');
  });

  it('404s an unknown account id', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const res = await post(owner, `${api}/groups/${group.id}/members`, { userId: '64b7f0c2b1a2c3d4e5f60718' });
    expect(res.status).toBe(404);
  });
});

describe('GET /users/search', () => {
  it('finds people you already share a group with', async () => {
    const owner = await makeUser({ name: 'Azeem Shahid' });
    const friend = await makeUser({ name: 'Sara Khan' });
    await makeGroup(owner, { memberEmails: [friend.email] });

    const res = await get(owner, `${api}/users/search?q=sara`);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0]).toMatchObject({ name: 'Sara Khan', known: true });
  });

  it('does not leak strangers on a partial name', async () => {
    const owner = await makeUser();
    await makeUser({ name: 'Sara Stranger' });

    const res = await get(owner, `${api}/users/search?q=sara`);
    expect(res.body.data.users).toEqual([]);
  });

  it('still finds a stranger by their exact email', async () => {
    const owner = await makeUser();
    const stranger = await makeUser({ name: 'Sara Stranger' });

    const res = await get(owner, `${api}/users/search?q=${stranger.email}`);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0]).toMatchObject({ email: stranger.email, known: false });
  });

  it('never returns yourself, and needs two characters', async () => {
    const owner = await makeUser({ name: 'Azeem Shahid' });
    const friend = await makeUser();
    await makeGroup(owner, { memberEmails: [friend.email] });

    expect((await get(owner, `${api}/users/search?q=azeem`)).body.data.users).toEqual([]);
    expect((await get(owner, `${api}/users/search?q=a`)).status).toBe(400);
  });
});

describe('request to join, then approve', () => {
  const codeOf = async (owner, group) => (await get(owner, `${api}/groups/${group.id}`)).body.data.group.joinCode;

  it('gives every new group a share code and link', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);
    const fetched = (await get(owner, `${api}/groups/${group.id}`)).body.data.group;

    expect(fetched.joinCode).toMatch(/^[0-9A-F]{8}$/);
    expect(fetched.shareLink).toMatch(`/join-request/${fetched.joinCode}`);
  });

  it('previews the group before asking to join', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner, { title: 'Hunza' });
    const code = await codeOf(owner, group);

    const res = await get(outsider, `${api}/join-request/${code}`);
    expect(res.body.data.group).toMatchObject({ title: 'Hunza', memberCount: 1 });
    expect(res.body.data.myStatus).toBeNull();
  });

  it('creates a request that does NOT grant access until approved', async () => {
    const owner = await makeUser();
    const outsider = await makeUser({ name: 'Sara Khan' });
    const group = await makeGroup(owner);
    const code = await codeOf(owner, group);

    const asked = await post(outsider, `${api}/join-request/${code}`);
    expect(asked.status).toBe(201);
    expect(asked.body.data.status).toBe('requested');

    // Still locked out of the group itself.
    expect((await get(outsider, `${api}/groups/${group.id}`)).status).toBe(403);
    expect((await get(outsider, `${api}/groups`)).body.data.groups).toEqual([]);

    const seen = (await get(owner, `${api}/groups/${group.id}`)).body.data.group;
    expect(seen.requestCount).toBe(1);
    expect(seen.members.find((memberRow) => memberRow.name === 'Sara Khan').status).toBe('requested');
  });

  it('lets an admin approve, which grants access', async () => {
    const owner = await makeUser();
    const outsider = await makeUser({ name: 'Sara Khan' });
    const group = await makeGroup(owner);
    await post(outsider, `${api}/join-request/${await codeOf(owner, group)}`);

    const member = (await get(owner, `${api}/groups/${group.id}`)).body.data.group.members.find(
      (memberRow) => memberRow.status === 'requested',
    );
    const approved = await patch(owner, `${api}/groups/${group.id}/members/${member.id}/approve`);

    expect(approved.status).toBe(200);
    expect(approved.body.data.member.status).toBe('active');
    expect((await get(outsider, `${api}/groups/${group.id}`)).status).toBe(200);
  });

  it('lets an admin reject by removing the request', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner);
    await post(outsider, `${api}/join-request/${await codeOf(owner, group)}`);

    const member = (await get(owner, `${api}/groups/${group.id}`)).body.data.group.members.find(
      (memberRow) => memberRow.status === 'requested',
    );
    const rejected = await request(app)
      .delete(`${api}/groups/${group.id}/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(rejected.status).toBe(200);
    expect((await get(owner, `${api}/groups/${group.id}`)).body.data.group.requestCount).toBe(0);
  });

  it('blocks a plain member from approving', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    await post(outsider, `${api}/join-request/${await codeOf(owner, group)}`);

    const member = (await get(owner, `${api}/groups/${group.id}`)).body.data.group.members.find(
      (memberRow) => memberRow.status === 'requested',
    );
    const res = await patch(friend, `${api}/groups/${group.id}/members/${member.id}/approve`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ADMIN');
  });

  it('refuses a duplicate request and an existing member', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner);
    const code = await codeOf(owner, group);

    await post(outsider, `${api}/join-request/${code}`);
    expect((await post(outsider, `${api}/join-request/${code}`)).body.error.code).toBe('ALREADY_REQUESTED');
    expect((await post(owner, `${api}/join-request/${code}`)).body.error.code).toBe('ALREADY_MEMBER');
  });

  it('lets someone already invited by email skip the queue', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner, { memberEmails: ['newbie@demo.pk'] });
    const newbie = await makeUser({ email: 'newbie@demo.pk' });

    const res = await post(newbie, `${api}/join-request/${await codeOf(owner, group)}`);
    expect(res.body.data.status).toBe('active'); // an admin already chose them
  });

  it('rejects a bad code', async () => {
    const user = await makeUser();
    expect((await get(user, `${api}/join-request/ZZZZZZZZ`)).status).toBe(404);
    expect((await post(user, `${api}/join-request/ZZZZZZZZ`)).status).toBe(404);
  });

  it('rotating the code kills the old one', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner);
    const oldCode = await codeOf(owner, group);

    const rotated = await post(owner, `${api}/groups/${group.id}/join-code/rotate`);
    expect(rotated.body.data.joinCode).not.toBe(oldCode);

    expect((await post(outsider, `${api}/join-request/${oldCode}`)).status).toBe(404);
    expect((await post(outsider, `${api}/join-request/${rotated.body.data.joinCode}`)).status).toBe(201);
  });

  it('requested members do not count towards the member count or balances', async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const group = await makeGroup(owner);
    await post(outsider, `${api}/join-request/${await codeOf(owner, group)}`);

    const seen = (await get(owner, `${api}/groups/${group.id}`)).body.data.group;
    expect(seen.memberCount).toBe(1);

    // And they cannot be named on an expense while still waiting.
    const res = await post(owner, `${api}/groups/${group.id}/expenses`, {
      title: 'Fuel', totalAmount: 1000, splitType: 'EQUAL',
      paidBy: [{ userId: owner.id, amount: 1000 }], participants: [owner.id, outsider.id],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });
});

describe('groups created before share codes existed', () => {
  it('gets a code the first time an admin opens it', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);
    await Group.findByIdAndUpdate(group.id, { $unset: { joinCode: 1 } });

    const fetched = await get(owner, `${api}/groups/${group.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.group.joinCode).toMatch(/^[0-9A-F]{8}$/);

    // The backfilled code works immediately.
    const outsider = await makeUser();
    expect((await post(outsider, `${api}/join-request/${fetched.body.data.group.joinCode}`)).status).toBe(201);
  });

  it('does not break for a plain member, who simply sees no code yet', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(owner, { memberEmails: [friend.email] });
    await Group.findByIdAndUpdate(group.id, { $unset: { joinCode: 1 } });

    const fetched = await get(friend, `${api}/groups/${group.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.group.shareLink).toBeNull();
  });

  it('can still be rotated explicitly', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner);

    const rotated = await post(owner, `${api}/groups/${group.id}/join-code/rotate`);
    expect(rotated.body.data.joinCode).toMatch(/^[0-9A-F]{8}$/);
  });
});
