import mongoose from 'mongoose';

// Categories a user added themselves. The seven defaults are not stored — they
// are constants every account shares, so nothing has to be seeded per user.
const categorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 30 },
  },
  { timestamps: true },
);

// Case-insensitive uniqueness per user: "Fuel" and "fuel" are the same category.
categorySchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Category = mongoose.model('Category', categorySchema);
