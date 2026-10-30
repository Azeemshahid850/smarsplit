import mongoose from 'mongoose';

// A deposit (positive) or withdrawal (negative) towards a goal, in whole rupees.
const contributionSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
});

// Progress is always summed from the contributions, never stored as a running total.
const savingsGoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    targetAmount: { type: Number, required: true, min: 1 },
    targetDate: { type: Date, default: null },
    contributions: { type: [contributionSchema], default: [] },
    reachedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

savingsGoalSchema.pre('validate', async function wholeRupeesOnly() {
  if (!Number.isInteger(this.targetAmount)) throw new Error('targetAmount must be a whole number of rupees');
  if (this.contributions.some((contribution) => !Number.isInteger(contribution.amount))) {
    throw new Error('contributions must be whole rupees');
  }
});

export const SavingsGoal = mongoose.model('SavingsGoal', savingsGoalSchema);
