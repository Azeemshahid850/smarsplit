import mongoose from 'mongoose';

// One document per issued refresh token. Rotation revokes the old and links
// replacedBy, so a replayed token is detectable.
const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Mongo TTL sweep: expired rows disappear on their own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
