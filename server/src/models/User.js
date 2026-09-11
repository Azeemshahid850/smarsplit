import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    defaultCurrency: { type: String, default: 'PKR' },
    googleId: { type: String, default: null, index: true, sparse: true },
    notifications: {
      email: { type: Boolean, default: true },
      groupActivity: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
    },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Safety net: even a stray res.json(user) cannot leak secrets.
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpiresAt;
    return ret;
  },
});

// Public shape sent to clients — never leaks passwordHash or reset fields.
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    avatarUrl: this.avatarUrl,
    defaultCurrency: this.defaultCurrency,
    hasPassword: Boolean(this.passwordHash),
    notifications: this.notifications,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
