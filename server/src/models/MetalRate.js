import mongoose from 'mongoose';

// Gold and silver prices for the zakat nisab, entered by an app admin — there is
// no free, reliable feed of Pakistani sarafa rates. One document, whole rupees per tola.
const metalRateSchema = new mongoose.Schema(
  {
    base: { type: String, default: 'PKR', unique: true },
    goldPerTola: { type: Number, default: null },
    silverPerTola: { type: Number, default: null },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'metal_rates' },
);

export const MetalRate = mongoose.model('MetalRate', metalRateSchema);
