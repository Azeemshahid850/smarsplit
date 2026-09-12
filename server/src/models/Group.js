import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: null },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    // pending  — invited by email, has not claimed the link yet
    // requested — asked to join through the share code, waiting on an admin
    status: { type: String, enum: ['active', 'pending', 'requested'], default: 'pending' },
    inviteToken: { type: String, default: null },
    joinedAt: { type: Date, default: null },
  },
  { _id: true },
);

const groupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['trip', 'home', 'event', 'other'], default: 'trip' },
    baseCurrency: { type: String, default: 'PKR' },
    tags: { type: [String], default: [] },
    startDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    settings: {
      simplifyDebts: { type: Boolean, default: true },
      anyoneCanEdit: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['ACTIVE', 'SETTLED'], default: 'ACTIVE' },
    // Short shareable code — anyone with it can ask to join, an admin approves.
    joinCode: { type: String, default: null, index: true, sparse: true },
  },
  { timestamps: true },
);

groupSchema.index({ 'members.user': 1, status: 1 });
groupSchema.index({ 'members.inviteToken': 1 });

// Active membership lookup — the single source of truth for authorization.
groupSchema.methods.memberFor = function memberFor(userId) {
  return this.members.find((m) => m.status === 'active' && String(m.user) === String(userId)) || null;
};

export const Group = mongoose.model('Group', groupSchema);
