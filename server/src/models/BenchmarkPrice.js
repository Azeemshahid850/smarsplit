import mongoose from 'mongoose';

// Local price book. A future live scraper writes into this same collection, so
// nothing that reads prices has to change when it arrives.
const benchmarkPriceSchema = new mongoose.Schema(
  {
    canonicalName: { type: String, required: true, trim: true },
    // Normalised spellings that should resolve to this product.
    aliases: { type: [String], default: [], index: true },
    size: { type: Number, default: null },
    unit: { type: String, default: null },
    price: { type: Number, required: true },
    // A store or platform name, free text so new ones can be added from the app.
    platform: { type: String, required: true, lowercase: true, trim: true },
    url: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'benchmark_prices' },
);

benchmarkPriceSchema.index({ canonicalName: 1, platform: 1 }, { unique: true });

export const BenchmarkPrice = mongoose.model('BenchmarkPrice', benchmarkPriceSchema);
