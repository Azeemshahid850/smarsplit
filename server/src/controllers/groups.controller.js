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
// One invite email per minute per person — a double-click must not send twice.
const RESEND_COOLDOWN_MS = 60 * 1000;

// Shapes a member for the client: resolved user details, never internal tokens.
function publicMember(memberRow) {
  const populated = memberRow.user && typeof memberRow.user === 'object' && memberRow.user.name;
  return {
    id: memberRow._id,
    userId: populated ? memberRow.user._id : memberRow.user,
    name: populated ? memberRow.user.name : memberRow.name || memberRow.email.split('@')[0],
    email: memberRow.email,
    avatarUrl: populated ? memberRow.user.avatarUrl : null,
    role: memberRow.role,
    status: memberRow.status,
    joinedAt: memberRow.joinedAt,
    inviteSentAt: memberRow.inviteSentAt,
    // Pending invites keep their link retrievable, so it can be re-copied at any
    // time rather than only in the moment it was created.
    joinLink: memberRow.inviteToken ? `${clientUrl()}/join/${memberRow.inviteToken}` : null,
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
    memberCount: group.members.filter((memberRow) => memberRow.status === 'active').length,
    pendingCount: group.members.filter((memberRow) => memberRow.status === 'pending').length,
    requestCount: group.members.filter((memberRow) => memberRow.status === 'requested').length,
    totalSpent,
    myBalance,
  };
}

// Claims a pending/requested row for a signed-in account. One place, so every
// way in (link, accept, share-code honouring an invite) flips the same fields.
function activate(memberRow, user) {
  memberRow.user = user._id;
  memberRow.name = user.name;
  memberRow.status = 'active';
  memberRow.joinedAt = new Date();
  memberRow.inviteToken = null; // single use
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
    [...new Set(memberEmails.map((emailAddress) => emailAddress.toLowerCase()))]
      .filter((emailAddress) => emailAddress !== req.user.email)
      .map((emailAddress) => buildMember(emailAddress)),
  );

  const group = await Group.create({ ...rest, createdBy: req.user._id, joinCode: newJoinCode(), members: [owner, ...invited] });

  // Strangers get their invite email now, not only when re-invited from the Members tab.
  const pending = group.members.filter((memberRow) => memberRow.status === 'pending');
  await Promise.all(
    pending.map((memberRow) =>
      sendGroupInviteMail(memberRow.email, {
        groupName: group.title,
        inviterName: req.user.name,
        joinUrl: `${clientUrl()}/join/${memberRow.inviteToken}`,
      })
        .then(() => {
          memberRow.inviteSentAt = new Date();
        })
        .catch(() => {}),
    ),
  );
  if (pending.length) await group.save();

  ok(res, { group: publicGroup(group) }, 201);
}

export async function listGroups(req, res) {
  const groups = await Group.find({ members: { $elemMatch: { user: req.user._id, status: 'active' } } })
    .populate('members.user', 'name avatarUrl')
    .sort({ createdAt: -1 });

  const summary = await summariseGroupsFor(req.user._id, groups.map((groupRow) => groupRow._id));
  ok(res, { groups: groups.map((groupRow) => publicGroup(groupRow, summary[String(groupRow._id)])) });
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

  const existing = group.members.find((memberRow) => memberRow.email === email);
  if (existing?.status === 'active') throw ApiError.conflict('They are already in this group', 'ALREADY_INVITED');

  let added;
  if (existing) {
    // Invited before they had an account — now that they do, let them straight in.
    const account = await User.findOne({ email });
    if (!account) throw ApiError.conflict('They have already been invited', 'ALREADY_INVITED');
    activate(existing, account);
    existing.role = role;
    added = existing;
  } else {
    group.members.push(await buildMember(email, role));
    added = group.members.at(-1);
  }
  await group.save();
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
    added.inviteSentAt = new Date();
    await group.save();
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

  const sinceLast = member.inviteSentAt ? Date.now() - member.inviteSentAt.getTime() : Infinity;
  if (sinceLast < RESEND_COOLDOWN_MS) {
    throw new ApiError(
      429,
      'RESEND_TOO_SOON',
      `That invite went out ${Math.max(1, Math.round(sinceLast / 1000))}s ago — wait a minute before sending it again`,
    );
  }

  if (!member.inviteToken) member.inviteToken = newInviteToken();

  const joinLink = `${clientUrl()}/join/${member.inviteToken}`;
  const result = await sendGroupInviteMail(member.email, {
    groupName: group.title,
    inviterName: req.user.name,
    joinUrl: joinLink,
  }).catch(() => ({ delivered: false }));

  member.inviteSentAt = new Date();
  await group.save();

  ok(res, { joinLink, emailed: result.delivered, mailConfigured: isMailConfigured(), inviteSentAt: member.inviteSentAt });
}

export async function removeMember(req, res) {
  const group = req.group;
  const target = group.members.find(
    (memberRow) => String(memberRow.user) === req.params.userId || String(memberRow._id) === req.params.userId,
  );
  if (!target) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');

  const activeAdmins = group.members.filter((memberRow) => memberRow.role === 'admin' && memberRow.status === 'active');
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

  const invite = group.members.find((memberRow) => memberRow.inviteToken === req.params.inviteToken);

  if (group.memberFor(req.user._id)) {
    throw ApiError.conflict('You are already a member of this group', 'ALREADY_MEMBER');
  }

  activate(invite, req.user);
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

  const membership = group.members.find((memberRow) => String(memberRow.user) === String(req.user._id));

  ok(res, {
    group: {
      id: group._id,
      title: group.title,
      type: group.type,
      memberCount: group.members.filter((memberRow) => memberRow.status === 'active').length,
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
    (memberRow) => String(memberRow.user) === String(req.user._id) || memberRow.email === req.user.email,
  );

  if (existing?.status === 'active') throw ApiError.conflict('You are already in this group', 'ALREADY_MEMBER');
  if (existing?.status === 'requested') throw ApiError.conflict('Your request is already waiting for approval', 'ALREADY_REQUESTED');

  if (existing?.status === 'pending') {
    // They were invited by email anyway — honour that and let them straight in.
    activate(existing, req.user);
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

  const admins = group.members.filter((memberRow) => memberRow.role === 'admin' && memberRow.status === 'active' && memberRow.user);
  await notify({
    recipients: admins.map((memberRow) => memberRow.user),
    type: 'JOIN_REQUESTED',
    message: `${req.user.name} asked to join ${group.title}`,
    groupId: group._id,
  });

  const adminUsers = await User.find({ _id: { $in: admins.map((memberRow) => memberRow.user) } }).select('email');
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

/**
 * Public look at an invite link, so someone without an account sees what they
 * were invited to before signing up. The token is the secret, nothing else.
 */
export async function previewInvite(req, res) {
  const group = await Group.findOne({ 'members.inviteToken': req.params.inviteToken }).populate('createdBy', 'name');
  if (!group) throw ApiError.notFound('Invite link is invalid or already used', 'BAD_INVITE');

  const invite = group.members.find((memberRow) => memberRow.inviteToken === req.params.inviteToken);
  ok(res, {
    group: { id: group._id, title: group.title, type: group.type, memberCount: group.members.filter((m) => m.status === 'active').length },
    email: invite.email,
    inviterName: group.createdBy?.name ?? null,
  });
}

/** Everything waiting on me: invites to my email, and requests I sent. */
export async function listInvites(req, res) {
  const groups = await Group.find({
    members: {
      $elemMatch: {
        $or: [
          { email: req.user.email, status: 'pending' },
          { user: req.user._id, status: 'requested' },
        ],
      },
    },
  })
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });

  const invites = groups.map((group) => {
    const row = group.members.find(
      (memberRow) =>
        (memberRow.email === req.user.email && memberRow.status === 'pending') ||
        (String(memberRow.user) === String(req.user._id) && memberRow.status === 'requested'),
    );
    return {
      groupId: group._id,
      title: group.title,
      type: group.type,
      memberCount: group.members.filter((memberRow) => memberRow.status === 'active').length,
      invitedBy: group.createdBy?.name ?? null,
      status: row.status,
      createdAt: group.createdAt,
    };
  });

  ok(res, { invites });
}

/** Accepts an invite that was sent to my email address. */
export async function acceptInvite(req, res) {
  const group = await Group.findById(req.params.id);
  const invite = group?.members.find((memberRow) => memberRow.email === req.user.email && memberRow.status === 'pending');
  if (!invite) throw ApiError.notFound('No invitation waiting for you here', 'NO_INVITE');

  activate(invite, req.user);
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

/** Declines an invite, or withdraws a request I sent. */
export async function declineInvite(req, res) {
  const group = await Group.findById(req.params.id);
  const row = group?.members.find(
    (memberRow) =>
      (memberRow.email === req.user.email && memberRow.status === 'pending') ||
      (String(memberRow.user) === String(req.user._id) && memberRow.status === 'requested'),
  );
  if (!row) throw ApiError.notFound('No invitation waiting for you here', 'NO_INVITE');

  row.deleteOne();
  await group.save();
  ok(res, { declined: true });
}

/** Admin promotes or demotes a member. The group always keeps one admin. */
export async function setMemberRole(req, res) {
  const group = req.group;
  const member = group.members.id(req.params.memberId);
  if (!member) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  if (member.status !== 'active') throw ApiError.badRequest('They have not joined yet', 'NOT_ACTIVE');

  const activeAdmins = group.members.filter((memberRow) => memberRow.role === 'admin' && memberRow.status === 'active');
  if (member.role === 'admin' && req.body.role === 'member' && activeAdmins.length === 1) {
    throw ApiError.badRequest('A group must keep at least one admin', 'LAST_ADMIN');
  }

  member.role = req.body.role;
  await group.save();
  await group.populate('members.user', 'name avatarUrl');
  ok(res, { member: publicMember(group.members.id(req.params.memberId)) });
}

/** Rotates the share code, which kills every copy of the old link. */
export async function rotateJoinCode(req, res) {
  req.group.joinCode = newJoinCode();
  await req.group.save();
  ok(res, { joinCode: req.group.joinCode, shareLink: `${clientUrl()}/join-request/${req.group.joinCode}` });
}

export { publicGroup, publicMember };
