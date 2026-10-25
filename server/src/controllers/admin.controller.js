import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { GroupExpense } from '../models/GroupExpense.js';
import { PersonalExpense } from '../models/PersonalExpense.js';
import { Receipt } from '../models/Receipt.js';
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { ok } from '../utils/ok.js';
import { isMailConfigured } from '../services/mailer.js';

/**
 * One read for the Admin page: totals, the newest people and groups, and
 * which optional services are wired up. Read-only on purpose — anything
 * destructive stays on the resource's own page.
 */
export async function overview(req, res) {
  const [users, groups, expenses, transactions, receipts, prices, stores, recentUsers, recentGroups] = await Promise.all([
    User.countDocuments(),
    Group.countDocuments(),
    GroupExpense.countDocuments({ deletedAt: null }),
    PersonalExpense.countDocuments(),
    Receipt.countDocuments(),
    BenchmarkPrice.countDocuments(),
    BenchmarkPrice.distinct('platform'),
    User.find().sort({ createdAt: -1 }).limit(50).select('name email avatarUrl createdAt googleId').lean(),
    Group.find().sort({ createdAt: -1 }).limit(50).populate('createdBy', 'name email').lean(),
  ]);

  // Groups per user, for the people table.
  const membership = await Group.aggregate([
    { $unwind: '$members' },
    { $match: { 'members.status': 'active', 'members.user': { $ne: null } } },
    { $group: { _id: '$members.user', groups: { $sum: 1 } } },
  ]);
  const groupsOf = Object.fromEntries(membership.map((row) => [String(row._id), row.groups]));

  ok(res, {
    totals: { users, groups, expenses, transactions, receipts, prices, stores: stores.length },
    services: {
      mail: isMailConfigured(),
      cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
      vision: Boolean(process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY),
      google: Boolean(process.env.GOOGLE_CLIENT_ID),
    },
    users: recentUsers.map((userRow) => ({
      id: userRow._id,
      name: userRow.name,
      email: userRow.email,
      avatarUrl: userRow.avatarUrl,
      createdAt: userRow.createdAt,
      viaGoogle: Boolean(userRow.googleId),
      groups: groupsOf[String(userRow._id)] ?? 0,
    })),
    groups: recentGroups.map((groupRow) => ({
      id: groupRow._id,
      title: groupRow.title,
      type: groupRow.type,
      status: groupRow.status,
      createdAt: groupRow.createdAt,
      createdBy: groupRow.createdBy?.name ?? '—',
      memberCount: groupRow.members.filter((memberRow) => memberRow.status === 'active').length,
      pendingCount: groupRow.members.filter((memberRow) => memberRow.status !== 'active').length,
    })),
  });
}
