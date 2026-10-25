import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { ApiError } from '../middleware/ApiError.js';
import { isSuperAdmin } from '../config/env.js';
import { seedBenchmarkPrices } from '../scripts/seedPrices.js';
import { ok } from '../utils/ok.js';
import { normalize } from '../services/priceMatch.js';
import { buildPriceWorkbook, parsePriceSheet, importPriceRows } from '../services/priceBook.js';

/**
 * The whole price book, grouped by product with one entry per store. Small
 * enough (a few hundred rows) to send at once and filter in the browser.
 */
export async function listPrices(req, res) {
  const rows = await BenchmarkPrice.find().sort({ canonicalName: 1, price: 1 }).lean();

  const byProduct = new Map();
  for (const row of rows) {
    const product = byProduct.get(row.canonicalName) ?? {
      canonicalName: row.canonicalName,
      size: row.size,
      unit: row.unit,
      aliases: row.aliases,
      prices: [],
    };
    product.prices.push({ id: row._id, platform: row.platform, price: row.price, url: row.url, updatedAt: row.updatedAt });
    byProduct.set(row.canonicalName, product);
  }

  const stores = [...new Set(rows.map((row) => row.platform))].sort();
  ok(res, { products: [...byProduct.values()], stores, canEdit: isSuperAdmin(req.user) });
}

/** One price per product per store: adding again updates the existing row. */
export async function upsertPrice(req, res) {
  const { canonicalName, platform, price, aliases, size, unit, url } = req.body;

  // The product's own name always resolves to it, whatever aliases were typed.
  const allAliases = [...new Set([normalize(canonicalName), ...aliases.map(normalize)].filter(Boolean))];

  const row = await BenchmarkPrice.findOneAndUpdate(
    { canonicalName, platform },
    {
      $set: { price, url: url ?? null, size: size ?? null, unit: unit ?? null, updatedAt: new Date() },
      $addToSet: { aliases: { $each: allAliases } },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  ok(res, { price: { id: row._id, canonicalName: row.canonicalName, platform: row.platform, price: row.price, url: row.url } }, 201);
}

/** Excel download of the whole book — edit it there and upload it back. */
export async function exportPrices(req, res) {
  const workbook = await buildPriceWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="smartsplit-price-book.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

/** Bulk upsert from a spreadsheet. Bad rows are reported, never silently dropped. */
export async function importPrices(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach an .xlsx or .csv file', 'NO_FILE');

  const rows = await parsePriceSheet(req.file.buffer, req.file.originalname).catch(() => {
    throw ApiError.badRequest('Could not read that file. Export the book to see the expected columns.', 'BAD_SHEET');
  });
  if (!rows.length) throw ApiError.badRequest('No rows found. The first row must be the column headings.', 'EMPTY_SHEET');

  ok(res, await importPriceRows(rows));
}

/** Replaces the price book with the bundled ~100-product catalogue. Touches nothing else. */
export async function seedDefaults(req, res) {
  ok(res, await seedBenchmarkPrices());
}

export async function deletePrice(req, res) {
  const row = await BenchmarkPrice.findByIdAndDelete(req.params.priceId);
  if (!row) throw ApiError.notFound('That price is already gone', 'PRICE_NOT_FOUND');
  ok(res, { deleted: true });
}
