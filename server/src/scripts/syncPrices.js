// Refresh the price book from the online stores right now, from a terminal:
//   npm run prices:sync
// Uses MONGO_URI from .env — so locally it updates your local database. The
// server runs the same job by itself every morning and from the Admin page.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { syncPrices } from '../services/priceSync.js';

await connectDB(process.env.MONGO_URI);
const run = await syncPrices({ trigger: 'cli', log: (line) => console.log(line) });
for (const store of run.stores) {
  const note = store.skipped ?? store.error ?? `${store.updated} prices updated (${store.matched} matched, ${store.searched} searches)`;
  console.log(`${store.store}: ${note}`);
}
console.log(`price sync ${run.status}${run.error ? `: ${run.error}` : ''}`);
await mongoose.disconnect();
