import mongoose from 'mongoose';
import { CATEGORIES } from './GroupExpense.js';

// One monthly cap per category per user.
const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: CATEGORIES, required: true },
    monthlyCap: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

export const Budget = mongoose.model('Budget', budgetSchema);
