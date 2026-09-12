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
    platform: { type: String, enum: ['daraz', 'metro', 'imtiaz'], required: true },
    url: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'benchmark_prices' },
);

benchmarkPriceSchema.index({ canonicalName: 1, platform: 1 });

export const BenchmarkPrice = mongoose.model('BenchmarkPrice', benchmarkPriceSchema);
