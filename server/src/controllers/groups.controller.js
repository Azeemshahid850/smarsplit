import crypto from 'node:crypto';

import { Group } from '../models/Group.js';
import { User } from '../models/User.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';

const newInviteToken = () => crypto.randomBytes(24).toString('hex');

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
    members: group.members.map(publicMember),
    memberCount: group.members.filter((m) => m.status === 'active').length,
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

  const group = await Group.create({ ...rest, createdBy: req.user._id, members: [owner, ...invited] });
  ok(res, { group: publicGroup(group) }, 201);
}

export async function listGroups(req, res) {
  const groups = await Group.find({ members: { $elemMatch: { user: req.user._id, status: 'active' } } })
    .populate('members.user', 'name avatarUrl')
    .sort({ createdAt: -1 });

  // Balances and totals are computed from expenses — wired in phase 3.
  ok(res, { groups: groups.map((g) => publicGroup(g)) });
}

export async function getGroup(req, res) {
  await req.group.populate('members.user', 'name avatarUrl');
  ok(res, { group: publicGroup(req.group) });
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
  const { email, role } = req.body;
  const group = req.group;

  if (group.members.some((m) => m.email === email)) {
    throw ApiError.conflict('That email is already on this group', 'ALREADY_INVITED');
  }

  group.members.push(await buildMember(email, role));
  await group.save();

  const added = group.members.at(-1);
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  ok(
    res,
    {
      member: publicMember(added),
      joinLink: added.inviteToken ? `${base}/join/${added.inviteToken}` : null,
    },
    201,
  );
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
}

export { publicGroup, publicMember };
