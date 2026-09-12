import mongoose from 'mongoose';

// One row per recipient — a group event fans out to every member so each person
// has their own read state.
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['EXPENSE_ADDED', 'MEMBER_JOINED', 'SETTLEMENT_CREATED', 'SETTLEMENT_PAID', 'BUDGET_EXCEEDED'],
    required: true,
  },
  message: { type: String, required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
