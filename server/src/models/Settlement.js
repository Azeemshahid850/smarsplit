import mongoose from 'mongoose';

// One optimized payment produced by the Min-Cash-Flow engine. Balances read
// these back so a recorded payment actually clears the debt it settles.
const settlementSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1 },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    rawDebtCount: { type: Number, default: 0 },
    optimizedCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

settlementSchema.index({ groupId: 1, isPaid: 1 });

export const Settlement = mongoose.model('Settlement', settlementSchema);
