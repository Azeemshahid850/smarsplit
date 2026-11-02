import mongoose from 'mongoose';

// Gold and silver prices for the zakat nisab, whole rupees per tola. One document:
// `market` is the last good international price (fetched, converted to rupees);
// the top-level fields are an app admin's bazaar (sarafa) price, which runs above it.
const metalRateSchema = new mongoose.Schema(
  {
    base: { type: String, default: 'PKR', unique: true },
    goldPerTola: { type: Number, default: null },
    silverPerTola: { type: Number, default: null },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    market: {
      goldPerTola: { type: Number, default: null },
      silverPerTola: { type: Number, default: null },
      fetchedAt: { type: Date, default: null },
    },
  },
  { collection: 'metal_rates' },
);

export const MetalRate = mongoose.model('MetalRate', metalRateSchema);
