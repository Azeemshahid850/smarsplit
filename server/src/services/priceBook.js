import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { upsertPriceSchema } from '../routes/prices.schemas.js';
import { seedBenchmarkPrices } from '../scripts/seedPrices.js';
import { normalize } from './priceMatch.js';

export const COLUMNS = [
  { header: 'Product', key: 'canonicalName', width: 28 },
  { header: 'Store', key: 'platform', width: 16 },
  { header: 'Price (Rs)', key: 'price', width: 12 },
  { header: 'Pack size', key: 'size', width: 10 },
  { header: 'Unit', key: 'unit', width: 8 },
  { header: 'Also known as', key: 'aliases', width: 40 },
  { header: 'Link', key: 'url', width: 40 },
];

// Header spellings people actually type, mapped to our keys.
const HEADER_ALIASES = {
  product: 'canonicalName', name: 'canonicalName', item: 'canonicalName', canonicalname: 'canonicalName',
  store: 'platform', shop: 'platform', platform: 'platform', seller: 'platform',
  price: 'price', pricers: 'price', rs: 'price', amount: 'price', rate: 'price',
  size: 'size', packsize: 'size', pack: 'size', quantity: 'size',
  unit: 'unit',
  aliases: 'aliases', alias: 'aliases', alsoknownas: 'aliases', keywords: 'aliases',
  url: 'url', link: 'url',
};

const headerKey = (text) => HEADER_ALIASES[String(text ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? null;
const cellText = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text ?? value.result ?? value.richText?.map((part) => part.text).join('') ?? '');
  return String(value);
};

/**
 * A fresh database has no price book, so receipts would never find a cheaper
 * price and the page would just say "empty". Load the bundled catalogue once;
 * anything already there (seeded, imported, hand-entered) is left alone.
 */
export async function ensurePriceBook() {
  if (await BenchmarkPrice.estimatedDocumentCount()) return null;
  return seedBenchmarkPrices();
}

/** The current book as a workbook — or a one-row example when it is empty, so it doubles as the template. */
export async function buildPriceWorkbook() {
  const rows = await BenchmarkPrice.find().sort({ canonicalName: 1, platform: 1 }).lean();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Prices');
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };

  const source = rows.length
    ? rows
    : [{ canonicalName: 'Cooking Oil 3L', platform: 'metro', price: 1790, size: 3, unit: 'L', aliases: ['cooking oil', 'dalda'], url: '' }];
  source.forEach((row) => sheet.addRow({ ...row, aliases: (row.aliases ?? []).join(', '), url: row.url ?? '' }));
  return workbook;
}

/** Reads an .xlsx or .csv upload into plain row objects keyed by our column names. */
export async function parsePriceSheet(buffer, filename = '') {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) await workbook.csv.read(Readable.from(buffer));
  else await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const keys = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    keys[col] = headerKey(cell.value);
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = { rowNumber };
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (keys[col]) record[keys[col]] = cellText(cell.value).trim();
    });
    if (Object.keys(record).length > 1) rows.push(record);
  });
  return rows;
}

/** Validates every row with the same rules as the form, upserts the good ones, reports the rest. */
export async function importPriceRows(rows) {
  const ops = [];
  const skipped = [];

  for (const raw of rows) {
    const parsed = upsertPriceSchema.safeParse({
      canonicalName: raw.canonicalName,
      platform: raw.platform,
      price: raw.price === '' || raw.price == null ? undefined : Number(String(raw.price).replace(/[^\d.-]/g, '')),
      size: raw.size ? Number(raw.size) : null,
      unit: raw.unit || null,
      aliases: (raw.aliases || '').split(/[,;|]/).map((alias) => alias.trim()).filter(Boolean),
      url: raw.url || null,
    });

    if (!parsed.success) {
      skipped.push({ row: raw.rowNumber, reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
      continue;
    }

    const { canonicalName, platform, price, size, unit, url, aliases } = parsed.data;
    const allAliases = [...new Set([normalize(canonicalName), ...aliases.map(normalize)].filter(Boolean))];
    ops.push({
      updateOne: {
        filter: { canonicalName, platform },
        update: { $set: { price, size, unit, url, updatedAt: new Date() }, $addToSet: { aliases: { $each: allAliases } } },
        upsert: true,
      },
    });
  }

  const result = ops.length ? await BenchmarkPrice.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  return { added: result.upsertedCount, updated: result.matchedCount, skipped };
}
