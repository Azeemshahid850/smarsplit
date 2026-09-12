import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { benchmarkRows } from './benchmarkPrices.js';

/** Replaces the price book with the bundled catalogue. Idempotent. */
export async function seedBenchmarkPrices() {
  await BenchmarkPrice.deleteMany({});
  const rows = benchmarkRows();
  await BenchmarkPrice.insertMany(rows);
  return { products: new Set(rows.map((r) => r.canonicalName)).size, rows: rows.length };
}
