import crypto from 'node:crypto';

import { Group } from '../models/Group.js';
import { User } from '../models/User.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { summariseGroupsFor } from '../services/balances.js';
import { notify, activeMemberIds } from '../services/notifications.js';
import { isMailConfigured, sendGroupInviteMail, sendJoinRequestMail } from '../services/mailer.js';

const newInviteToken = () => crypto.randomBytes(24).toString('hex');
// Short and human-shareable — it only gets you a request, never membership.
const newJoinCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Shapes a member for the client: resolved user details, never internal tokens.
function publicMember(m) {
  const populated = m.user && typeof m.user === 'object' && m.user.name;
  return {
    id: m._id,
    userId: populated ? m.user._id : m.user,
    name: populated ? m.user.name : m.name || m.email.split('@')[0],
    email: m.email,
    avatarUrl: populated ? m.user.avatarUrl : null,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    // Pending invites keep their link retrievable, so it can be re-copied at any
    // time rather than only in the moment it was created.
    joinLink: m.inviteToken ? `${clientUrl()}/join/${m.inviteToken}` : null,
  };
}

function publicGroup(group, { myBalance = 0, totalSpent = 0 } = {}) {
  return {
    id: group._id,
    title: group.title,
    description: group.description,
    type: group.type,
    baseCurrency: group.baseCurrency,
    tags: group.tags,
    startDate: group.startDate,
    status: group.status,
    settings: group.settings,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
    joinCode: group.joinCode,
    shareLink: group.joinCode ? `${clientUrl()}/join-request/${group.joinCode}` : null,
    members: group.members.map(publicMember),
    memberCount: group.members.filter((m) => m.status === 'active').length,
    pendingCount: group.members.filter((m) => m.status === 'pending').length,
    requestCount: group.members.filter((m) => m.status === 'requested').length,
    totalSpent,
    myBalance,
  };
}

// Builds a member subdoc: an existing account joins active, a stranger stays
// pending behind an invite link.
async function buildMember(email, role = 'member') {
  const existing = await User.findOne({ email });
  return existing
    ? { user: existing._id, email, name: existing.name, role, status: 'active', joinedAt: new Date() }
    : { user: null, email, role, status: 'pending', inviteToken: newInviteToken() };
}

export async function createGroup(req, res) {
  const { memberEmails, ...rest } = req.body;

  const owner = {
    user: req.user._id,
    email: req.user.email,
    name: req.user.name,
    role: 'admin',
    status: 'active',
    joinedAt: new Date(),
  };

  const invited = await Promise.all(
    [...new Set(memberEmails.map((e) => e.toLowerCase()))]
      .filter((e) => e !== req.user.email)
      .map((e) => buildMember(e)),
  );

  const group = await Group.create({ ...rest, createdBy: req.user._id, joinCode: newJoinCode(), members: [owner, ...invited] });
  ok(res, { group: publicGroup(group) }, 201);
}

export async function listGroups(req, res) {
  const groups = await Group.find({ members: { $elemMatch: { user: req.user._id, status: 'active' } } })
    .populate('members.user', 'name avatarUrl')
    .sort({ createdAt: -1 });

  const summary = await summariseGroupsFor(req.user._id, groups.map((g) => g._id));
  ok(res, { groups: groups.map((g) => publicGroup(g, summary[String(g._id)])) });
}

export async function getGroup(req, res) {
  // Groups created before share codes existed get one the first time an admin
  // opens them, so the request-to-join flow works everywhere.
  if (!req.group.joinCode && req.membership.role === 'admin') {
    req.group.joinCode = newJoinCode();
    await req.group.save();
  }

  await req.group.populate('members.user', 'name avatarUrl');
  const summary = await summariseGroupsFor(req.user._id, [req.group._id]);
  ok(res, { group: publicGroup(req.group, summary[String(req.group._id)]) });
}

export async function updateGroup(req, res) {
  const { settings, ...rest } = req.body;
  Object.assign(req.group, rest);
  if (settings) Object.assign(req.group.settings, settings);
  await req.group.save();
  await req.group.populate('members.user', 'name avatarUrl');
  ok(res, { group: publicGroup(req.group) });
}

export async function inviteMember(req, res) {
  const { role } = req.body;
  const group = req.group;

  // Two ways in: pick an existing account by id, or type an email address.
  let email = req.body.email;
  if (req.body.userId) {
    const user = await User.findById(req.body.userId);
    if (!user) throw ApiError.notFound('That account no longer exists', 'USER_NOT_FOUND');
    email = user.email;
  }

  const existing = group.members.find((m) => m.email === email);
  if (existing) {
    throw ApiError.conflict(
      existing.status === 'active' ? 'They are already in this group' : 'They have already been invited',
      'ALREADY_INVITED',
    );
  }

  group.members.push(await buildMember(email, role));
  await group.save();

  const added = group.members.at(-1);
  const joinLink = added.inviteToken ? `${clientUrl()}/join/${added.inviteToken}` : null;

  let emailed = false;
  if (joinLink) {
    // Never let a mail failure lose the invite — the link is returned either way.
    const result = await sendGroupInviteMail(email, {
      groupName: group.title,
      inviterName: req.user.name,
      joinUrl: joinLink,
    }).catch(() => ({ delivered: false }));
    emailed = result.delivered;
  }

  ok(res, { member: publicMember(added), joinLink, emailed, mailConfigured: isMailConfigured() }, 201);

  if (added.status === 'active' && added.user) {
    await notify({
      recipients: [added.user],
      type: 'MEMBER_JOINED',
      message: `${req.user.name} added you to ${group.title}`,
      groupId: group._id,
    });
  }
}

/** Re-sends an outstanding invite and hands the link back for copying. */
export async function resendInvite(req, res) {
  const group = req.group;
  const member = group.members.id(req.params.memberId);
  if (!member) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  if (member.status !== 'pending') throw ApiError.badRequest('That invite has already been used', 'NOT_PENDING');

  if (!member.inviteToken) {
    member.inviteToken = newInviteToken();
    await group.save();
  }

  const joinLink = `${clientUrl()}/join/${member.inviteToken}`;
  const result = await sendGroupInviteMail(member.email, {
    groupName: group.title,
    inviterName: req.user.name,
    joinUrl: joinLink,
  }).catch(() => ({ delivered: false }));

  ok(res, { joinLink, emailed: result.delivered, mailConfigured: isMailConfigured() });
}

export async function removeMember(req, res) {
  const group = req.group;
  const target = group.members.find(
    (m) => String(m.user) === req.params.userId || String(m._id) === req.params.userId,
  );
  if (!target) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');

  const activeAdmins = group.members.filter((m) => m.role === 'admin' && m.status === 'active');
  if (target.role === 'admin' && activeAdmins.length === 1) {
    throw ApiError.badRequest('A group must keep at least one admin', 'LAST_ADMIN');
  }

  target.deleteOne();
  await group.save();
  ok(res, { removed: true });
}

export async function joinGroup(req, res) {
  const group = await Group.findOne({ 'members.inviteToken': req.params.inviteToken });
  if (!group) throw ApiError.notFound('Invite link is invalid or already used', 'BAD_INVITE');

  const invite = group.members.find((m) => m.inviteToken === req.params.inviteToken);

  if (group.memberFor(req.user._id)) {
    throw ApiError.conflict('You are already a member of this group', 'ALREADY_MEMBER');
  }

  invite.user = req.user._id;
  invite.name = req.user.name;
  invite.status = 'active';
  invite.joinedAt = new Date();
  invite.inviteToken = null; // single use
  await group.save();

  ok(res, { group: publicGroup(group) });

  await notify({
    recipients: activeMemberIds(group),
    exclude: req.user._id,
    type: 'MEMBER_JOINED',
    message: `${req.user.name} joined ${group.title}`,
    groupId: group._id,
  });
}

/** Preview a group from its share code, so a requester sees what they are joining. */
export async function previewByCode(req, res) {
  const group = await Group.findOne({ joinCode: req.params.joinCode.toUpperCase() });
  if (!group) throw ApiError.notFound('That join code is not valid', 'BAD_JOIN_CODE');

  const membership = group.members.find((m) => String(m.user) === String(req.user._id));

  ok(res, {
    group: {
      id: group._id,
      title: group.title,
      type: group.type,
      memberCount: group.members.filter((m) => m.status === 'active').length,
    },
    myStatus: membership?.status ?? null,
  });
}

/**
 * Asking to join. Unlike an emailed invite — where an admin already chose the
 * person — a code can be forwarded to anyone, so this only ever creates a
 * request that an admin has to approve.
 */
export async function requestToJoin(req, res) {
  const group = await Group.findOne({ joinCode: req.params.joinCode.toUpperCase() });
  if (!group) throw ApiError.notFound('That join code is not valid', 'BAD_JOIN_CODE');

  const existing = group.members.find(
    (m) => String(m.user) === String(req.user._id) || m.email === req.user.email,
  );

  if (existing?.status === 'active') throw ApiError.conflict('You are already in this group', 'ALREADY_MEMBER');
  if (existing?.status === 'requested') throw ApiError.conflict('Your request is already waiting for approval', 'ALREADY_REQUESTED');

  if (existing?.status === 'pending') {
    // They were invited by email anyway — honour that and let them straight in.
    existing.user = req.user._id;
    existing.name = req.user.name;
    existing.status = 'active';
    existing.joinedAt = new Date();
    existing.inviteToken = null;
    await group.save();

    return ok(res, { status: 'active', groupId: group._id });
  }

  group.members.push({
    user: req.user._id,
    email: req.user.email,
    name: req.user.name,
    role: 'member',
    status: 'requested',
  });
  await group.save();

  ok(res, { status: 'requested', groupId: group._id }, 201);

  const admins = group.members.filter((m) => m.role === 'admin' && m.status === 'active' && m.user);
  await notify({
    recipients: admins.map((m) => m.user),
    type: 'JOIN_REQUESTED',
    message: `${req.user.name} asked to join ${group.title}`,
    groupId: group._id,
  });

  const adminUsers = await User.find({ _id: { $in: admins.map((m) => m.user) } }).select('email');
  await Promise.all(
    adminUsers.map((admin) =>
      sendJoinRequestMail(admin.email, {
        groupName: group.title,
        requesterName: req.user.name,
        groupUrl: `${clientUrl()}/groups/${group._id}`,
      }).catch(() => {}),
    ),
  );
}

/** Admin approves a waiting request. */
export async function approveMember(req, res) {
  const group = req.group;
  const member = group.members.id(req.params.memberId);
  if (!member) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  if (member.status !== 'requested') throw ApiError.badRequest('That person is not waiting for approval', 'NOT_REQUESTED');

  member.status = 'active';
  member.joinedAt = new Date();
  await group.save();
  await group.populate('members.user', 'name avatarUrl');

  ok(res, { member: publicMember(group.members.id(req.params.memberId)) });

  await notify({
    recipients: [member.user],
    type: 'MEMBER_JOINED',
    message: `You were approved to join ${group.title}`,
    groupId: group._id,
  });
  await notify({
    recipients: activeMemberIds(group),
    exclude: member.user,
    type: 'MEMBER_JOINED',
    message: `${member.name || member.email} joined ${group.title}`,
    groupId: group._id,
  });
}

/** Rotates the share code, which kills every copy of the old link. */
export async function rotateJoinCode(req, res) {
  req.group.joinCode = newJoinCode();
  await req.group.save();
  ok(res, { joinCode: req.group.joinCode, shareLink: `${clientUrl()}/join-request/${req.group.joinCode}` });
}

export { publicGroup, publicMember };
