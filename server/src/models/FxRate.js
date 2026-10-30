import mongoose from 'mongoose';

// Last good set of exchange rates, so a restart or a provider outage still has
// rates to convert with. One document: base PKR, rates as rupees per unit.
const fxRateSchema = new mongoose.Schema(
  {
    base: { type: String, default: 'PKR', unique: true },
    rates: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { collection: 'fx_rates' },
);

export const FxRate = mongoose.model('FxRate', fxRateSchema);
