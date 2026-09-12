import mongoose from 'mongoose';

// Append-only trail of the actions that move money. Never updated, never deleted.
const auditLogSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  detail: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
