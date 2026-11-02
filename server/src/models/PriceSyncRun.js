import mongoose from 'mongoose';

// One run of the weekly store-price refresh, so the Admin page can show when it
// last ran, what each store gave back and why a store was skipped.
const storeResultSchema = new mongoose.Schema(
  {
    store: { type: String, required: true },
    searched: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: String, default: null }, // e.g. "robots.txt disallows /catalog/"
    error: { type: String, default: null },
  },
  { _id: false },
);

const priceSyncRunSchema = new mongoose.Schema(
  {
    trigger: { type: String, enum: ['schedule', 'startup', 'manual', 'cli'], required: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    stores: { type: [storeResultSchema], default: [] },
    error: { type: String, default: null },
  },
  { collection: 'price_sync_runs' },
);

priceSyncRunSchema.index({ startedAt: -1 });

export const PriceSyncRun = mongoose.model('PriceSyncRun', priceSyncRunSchema);
