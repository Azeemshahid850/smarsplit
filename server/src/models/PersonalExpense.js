import mongoose from 'mongoose';

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'JazzCash', 'Easypaisa', 'Raast'];
export const RECURRING_INTERVALS = ['weekly', 'monthly'];

const alternativeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    onlinePrice: { type: Number, required: true },
    source: { type: String, default: null },
    url: { type: String, default: null },
    saving: { type: Number, default: 0 },
  },
  { _id: false },
);

const personalExpenseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    category: { type: String, default: 'Misc', trim: true, maxlength: 30 },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], default: 'DEBIT' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'Cash' },
    date: { type: Date, default: Date.now },
    note: { type: String, default: '' },
    receiptUrl: { type: String, default: null },
    isRecurring: { type: Boolean, default: false },
    recurring: {
      interval: { type: String, enum: RECURRING_INTERVALS, default: null },
      nextRunAt: { type: Date, default: null },
    },
    // Written by the price recommender in phase 7.
    suggestedAlternatives: { type: [alternativeSchema], default: [] },
    potentialSavings: { type: Number, default: 0 },
    // Set on rows the recurring engine materialised, so they never recur themselves.
    generatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalExpense', default: null },
  },
  { timestamps: true },
);

personalExpenseSchema.index({ userId: 1, date: -1 });
personalExpenseSchema.index({ isRecurring: 1, 'recurring.nextRunAt': 1 });

personalExpenseSchema.pre('validate', async function wholeRupeesOnly() {
  if (!Number.isInteger(this.amount)) throw new Error('amount must be a whole number of rupees');
});

export const PersonalExpense = mongoose.model('PersonalExpense', personalExpenseSchema);
