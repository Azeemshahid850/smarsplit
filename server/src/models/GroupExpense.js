import mongoose from 'mongoose';

// Re-exported for convenience; the authoritative list (defaults + a user's own)
// lives in services/categories.js.
export { DEFAULT_CATEGORIES as CATEGORIES } from '../services/categories.js';
export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE', 'LINE_ITEM'];

const payerSchema = new mongoose.Schema(
  { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, amount: { type: Number, required: true } },
  { _id: false },
);

const splitSchema = new mongoose.Schema(
  { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, share: { type: Number, required: true } },
  { _id: false },
);

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1 },
    price: { type: Number, required: true },
    sharedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { _id: false },
);

const groupExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    title: { type: String, required: true, trim: true },
    totalAmount: { type: Number, required: true, min: 1 },
    // Free text by design: a category can be deleted without orphaning the
    // expenses that already used it. Allowed values are checked in the controller.
    category: { type: String, default: 'Misc', trim: true, maxlength: 30 },
    date: { type: Date, default: Date.now },
    paidBy: { type: [payerSchema], required: true },
    splitType: { type: String, enum: SPLIT_TYPES, required: true },
    splits: { type: [splitSchema], required: true },
    items: { type: [itemSchema], default: [] },
    notes: { type: String, default: '' },
    receiptImage: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

groupExpenseSchema.index({ groupId: 1, deletedAt: 1, date: -1 });

// Last line of defence: the money invariants hold for anything that reaches the
// database, whatever route wrote it.
groupExpenseSchema.pre('validate', async function enforceMoneyInvariants() {
  const total = this.totalAmount;
  if (!Number.isInteger(total)) throw new Error('totalAmount must be a whole number of rupees');

  const paid = this.paidBy.reduce((t, p) => t + p.amount, 0);
  if (paid !== total) throw new Error(`sum(paidBy.amount) ${paid} !== totalAmount ${total}`);

  const shared = this.splits.reduce((t, s) => t + s.share, 0);
  if (shared !== total) throw new Error(`sum(splits.share) ${shared} !== totalAmount ${total}`);
});

export const GroupExpense = mongoose.model('GroupExpense', groupExpenseSchema);
