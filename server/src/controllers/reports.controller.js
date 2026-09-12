import { PersonalExpense } from '../models/PersonalExpense.js';
import { GroupExpense } from '../models/GroupExpense.js';
import { Group } from '../models/Group.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { monthRange } from './personal.controller.js';
import { personalMonthly, personalTrends, groupSummary } from '../services/reports.js';
import {
  toCsv,
  toXlsx,
  personalMonthlyPdf,
  groupReportPdf,
  TRANSACTION_COLUMNS,
  GROUP_EXPENSE_COLUMNS,
  flattenTransaction,
  flattenGroupExpense,
} from '../services/exports.js';

export async function monthlyReport(req, res) {
  ok(res, { report: await personalMonthly(req.user._id, req.query.month) });
}

export async function trendsReport(req, res) {
  ok(res, { report: await personalTrends(req.user._id, req.query.months) });
}

export async function groupReport(req, res) {
  await req.group.populate('members.user', 'name avatarUrl');
  ok(res, { report: await groupSummary(req.group) });
}

const send = (res, buffer, type, filename) =>
  res
    .status(200)
    .set('Content-Type', type)
    .set('Content-Disposition', `attachment; filename="${filename}"`)
    .send(buffer);

/** CSV / XLSX / PDF for either personal transactions or one group. */
export async function exportReport(req, res) {
  const { format, scope, groupId, month, category } = req.query;

  if (scope === 'group') {
    const group = await Group.findById(groupId);
    if (!group?.memberFor(req.user._id)) throw ApiError.forbidden('You are not a member of that group', 'NOT_A_MEMBER');
    await group.populate('members.user', 'name avatarUrl');

    const nameOf = (userId) =>
      group.members.find((m) => String(m.user?._id ?? m.user) === String(userId))?.user?.name ?? 'Someone';

    const filter = { groupId: group._id, deletedAt: null, ...(category && { category }) };
    if (month) {
      const { start, end } = monthRange(month);
      filter.date = { $gte: start, $lt: end };
    }

    const expenses = await GroupExpense.find(filter).sort({ date: 1 }).lean();
    const rows = expenses.map((e) => flattenGroupExpense(e, nameOf));
    const base = `${group.title.replace(/\W+/g, '-').toLowerCase()}-expenses`;

    if (format === 'csv') return send(res, toCsv(rows, GROUP_EXPENSE_COLUMNS), 'text/csv', `${base}.csv`);
    if (format === 'xlsx') {
      const buffer = await toXlsx(rows, GROUP_EXPENSE_COLUMNS, 'Expenses');
      return send(res, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${base}.xlsx`);
    }
    return send(res, await groupReportPdf(await groupSummary(group)), 'application/pdf', `${base}.pdf`);
  }

  const filter = { userId: req.user._id, ...(category && { category }) };
  if (month) {
    const { start, end } = monthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  const transactions = await PersonalExpense.find(filter).sort({ date: 1 }).lean();
  const rows = transactions.map(flattenTransaction);
  const base = `smartsplit-transactions${month ? `-${month}` : ''}`;

  if (format === 'csv') return send(res, toCsv(rows, TRANSACTION_COLUMNS), 'text/csv', `${base}.csv`);
  if (format === 'xlsx') {
    const buffer = await toXlsx(rows, TRANSACTION_COLUMNS, 'Transactions');
    return send(res, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${base}.xlsx`);
  }

  const report = await personalMonthly(req.user._id, month);
  return send(res, await personalMonthlyPdf(report, req.user.name), 'application/pdf', `${base}.pdf`);
}

export async function listNotifications(req, res) {
  const filter = { userId: req.user._id, ...(req.query.unreadOnly && { readAt: null }) };

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(req.query.limit).lean(),
    Notification.countDocuments({ userId: req.user._id, readAt: null }),
  ]);

  ok(res, {
    notifications: notifications.map((n) => ({
      id: n._id,
      type: n.type,
      message: n.message,
      groupId: n.groupId,
      meta: n.meta,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
}

export async function markNotificationRead(req, res) {
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, userId: req.user._id },
    { readAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!updated) throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  ok(res, { read: true });
}

export async function markAllRead(req, res) {
  const { modifiedCount } = await Notification.updateMany({ userId: req.user._id, readAt: null }, { readAt: new Date() });
  ok(res, { marked: modifiedCount });
}
