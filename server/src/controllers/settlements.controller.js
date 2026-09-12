import { GroupExpense } from '../models/GroupExpense.js';
import { Settlement } from '../models/Settlement.js';
import { Group } from '../models/Group.js';
import { AuditLog } from '../models/AuditLog.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { settlementPreview } from '../services/settlement.js';
import { notify, activeMemberIds } from '../services/notifications.js';

// Names for the UI, resolved once per request.
function memberIndex(group) {
  return Object.fromEntries(
    group.members
      .filter((memberRow) => memberRow.user)
      .map((memberRow) => [String(memberRow.user._id ?? memberRow.user), { name: memberRow.user.name ?? memberRow.name ?? memberRow.email, avatarUrl: memberRow.user.avatarUrl ?? null }]),
  );
}

const decorate = (payments, people) =>
  payments.map((paymentRow) => ({
    ...paymentRow,
    fromName: people[String(paymentRow.from)]?.name ?? 'Someone',
    toName: people[String(paymentRow.to)]?.name ?? 'Someone',
  }));

async function loadLedger(groupId) {
  const [expenses, settlements] = await Promise.all([
    GroupExpense.find({ groupId, deletedAt: null }).lean(),
    Settlement.find({ groupId }).lean(),
  ]);
  return { expenses, settlements };
}

/** Computes only — nothing is written. */
export async function previewSettlement(req, res) {
  const group = req.group;
  const { expenses, settlements } = await loadLedger(group._id);
  const preview = settlementPreview(expenses, settlements);

  await group.populate('members.user', 'name avatarUrl');
  const people = memberIndex(group);

  ok(res, {
    payments: decorate(preview.payments, people),
    rawDebts: decorate(preview.rawDebts, people),
    rawDebtCount: preview.rawDebtCount,
    optimizedCount: preview.optimizedCount,
    transfersSaved: preview.transfersSaved,
  });
}

/** Persists the optimized payments and closes the group. */
export async function recordSettlement(req, res) {
  const group = req.group;
  const { expenses, settlements } = await loadLedger(group._id);

  if (await Settlement.exists({ groupId: group._id, isPaid: false })) {
    throw ApiError.conflict('This group already has a settlement in progress', 'SETTLEMENT_IN_PROGRESS');
  }

  const preview = settlementPreview(expenses, settlements);
  if (!preview.payments.length) throw ApiError.badRequest('Everyone is already settled up', 'NOTHING_TO_SETTLE');

  const created = await Settlement.insertMany(
    preview.payments.map((paymentRow) => ({
      groupId: group._id,
      fromUser: paymentRow.from,
      toUser: paymentRow.to,
      amount: paymentRow.amount,
      isPaid: false,
      rawDebtCount: preview.rawDebtCount,
      optimizedCount: preview.optimizedCount,
      createdBy: req.user._id,
    })),
  );

  group.status = 'SETTLED';
  await group.save();

  await AuditLog.create({
    groupId: group._id,
    userId: req.user._id,
    action: 'SETTLEMENT_CREATED',
    detail: {
      rawDebtCount: preview.rawDebtCount,
      optimizedCount: preview.optimizedCount,
      transfersSaved: preview.transfersSaved,
    },
  });

  await group.populate('members.user', 'name avatarUrl');
  const people = memberIndex(group);

  ok(
    res,
    {
      settlements: created.map((settlementRow) => ({
        id: settlementRow._id,
        from: settlementRow.fromUser,
        to: settlementRow.toUser,
        amount: settlementRow.amount,
        isPaid: settlementRow.isPaid,
        fromName: people[String(settlementRow.fromUser)]?.name ?? 'Someone',
        toName: people[String(settlementRow.toUser)]?.name ?? 'Someone',
      })),
      rawDebtCount: preview.rawDebtCount,
      optimizedCount: preview.optimizedCount,
      transfersSaved: preview.transfersSaved,
      groupStatus: group.status,
    },
    201,
  );

  await notify({
    recipients: activeMemberIds(group),
    exclude: req.user._id,
    type: 'SETTLEMENT_CREATED',
    message: `${req.user.name.split(' ')[0]} settled up ${group.title} — ${preview.optimizedCount} payments instead of ${preview.rawDebtCount}`,
    groupId: group._id,
    meta: { transfersSaved: preview.transfersSaved },
  });
}

export async function listSettlements(req, res) {
  const group = req.group;
  const settlements = await Settlement.find({ groupId: group._id }).sort({ createdAt: 1 }).lean();

  await group.populate('members.user', 'name avatarUrl');
  const people = memberIndex(group);

  const log = await AuditLog.find({ groupId: group._id }).sort({ createdAt: -1 }).limit(20).lean();

  ok(res, {
    settlements: settlements.map((settlementRow) => ({
      id: settlementRow._id,
      from: settlementRow.fromUser,
      to: settlementRow.toUser,
      amount: settlementRow.amount,
      isPaid: settlementRow.isPaid,
      paidAt: settlementRow.paidAt,
      fromName: people[String(settlementRow.fromUser)]?.name ?? 'Someone',
      toName: people[String(settlementRow.toUser)]?.name ?? 'Someone',
    })),
    auditTrail: log.map((logEntry) => ({ action: logEntry.action, detail: logEntry.detail, at: logEntry.createdAt })),
    groupStatus: group.status,
  });
}

/** Marks one payment as actually made — balances pick it up immediately. */
export async function markPaid(req, res) {
  const settlement = await Settlement.findById(req.params.settlementId);
  if (!settlement) throw ApiError.notFound('Settlement not found', 'SETTLEMENT_NOT_FOUND');

  const group = await Group.findById(settlement.groupId);
  if (!group?.memberFor(req.user._id)) {
    throw ApiError.forbidden('You are not a member of this group', 'NOT_A_MEMBER');
  }

  settlement.isPaid = req.body.isPaid;
  settlement.paidAt = req.body.isPaid ? new Date() : null;
  await settlement.save();

  await AuditLog.create({
    groupId: group._id,
    userId: req.user._id,
    action: settlement.isPaid ? 'SETTLEMENT_PAID' : 'SETTLEMENT_UNPAID',
    detail: { settlementId: settlement._id, amount: settlement.amount },
  });

  // Everything paid means the group is genuinely closed out.
  const outstanding = await Settlement.countDocuments({ groupId: group._id, isPaid: false });
  if (outstanding === 0 && group.status !== 'SETTLED') {
    group.status = 'SETTLED';
    await group.save();
  }

  ok(res, { settlement: { id: settlement._id, isPaid: settlement.isPaid, paidAt: settlement.paidAt }, outstanding });

  if (settlement.isPaid) {
    await notify({
      recipients: activeMemberIds(group),
      exclude: req.user._id,
      type: 'SETTLEMENT_PAID',
      message: `A payment of Rs ${settlement.amount.toLocaleString('en-PK')} was marked paid in ${group.title}`,
      groupId: group._id,
      meta: { settlementId: settlement._id },
    });
  }
}
