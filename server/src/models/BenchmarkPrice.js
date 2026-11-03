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

// The stores the daily refresh reads (STORES in services/priceSync.js). Only their
// prices are shown and compared against; rows for any other store stay in the
// collection but are left out, so widening this list brings them back.
export const LIVE_STORES = ['alfatah', 'grocerapp', 'metro', 'jalal sons', 'chaseup'];
export const liveStoresOnly = () => ({ platform: { $in: LIVE_STORES } });

export const BenchmarkPrice = mongoose.model('BenchmarkPrice', benchmarkPriceSchema);
