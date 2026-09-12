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
        .flatMap((groupRow) => groupRow.members)
        .filter((memberRow) => memberRow.user && String(memberRow.user) !== String(req.user._id))
        .map((memberRow) => String(memberRow.user)),
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
    .filter((userRow) => String(userRow._id) !== String(req.user._id) && !seen.has(String(userRow._id)) && seen.add(String(userRow._id)))
    .map((userRow) => ({
      id: userRow._id,
      name: userRow.name,
      email: userRow.email,
      avatarUrl: userRow.avatarUrl,
      // Flags the ones you have travelled with, so the list is easy to trust.
      known: knownIds.includes(String(userRow._id)),
    }));

  ok(res, { users });
}
