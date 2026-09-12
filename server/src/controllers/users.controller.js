import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { ok } from '../utils/ok.js';

/**
 * People the user can add to a group without typing an address.
 *
 * Deliberately not a directory search: it returns accounts you already share a
 * group with, plus an exact email match. That covers "add the people I always
 * travel with" without turning the app into a way to enumerate every user.
 */
export async function searchUsers(req, res) {
  const q = req.query.q.trim();
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const groups = await Group.find({ members: { $elemMatch: { user: req.user._id, status: 'active' } } })
    .select('members.user members.status')
    .lean();

  const knownIds = [
    ...new Set(
      groups
        .flatMap((g) => g.members)
        .filter((m) => m.user && String(m.user) !== String(req.user._id))
        .map((m) => String(m.user)),
    ),
  ];

  const [known, exact] = await Promise.all([
    User.find({ _id: { $in: knownIds }, $or: [{ name: rx }, { email: rx }] })
      .select('name email avatarUrl')
      .limit(8)
      .lean(),
    q.includes('@')
      ? User.find({ email: q.toLowerCase() }).select('name email avatarUrl').limit(1).lean()
      : Promise.resolve([]),
  ]);

  const seen = new Set();
  const users = [...known, ...exact]
    .filter((u) => String(u._id) !== String(req.user._id) && !seen.has(String(u._id)) && seen.add(String(u._id)))
    .map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      // Flags the ones you have travelled with, so the list is easy to trust.
      known: knownIds.includes(String(u._id)),
    }));

  ok(res, { users });
}
