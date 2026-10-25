// Runs every demo receipt through each OCR engine and scores it against the
// ground truth in docs/demo/expected.json.
//   cd server && node src/scripts/compareReceipts.mjs ../docs/demo
//   OR_KEY=<openrouter key> node src/scripts/compareReceipts.mjs ../docs/demo   # adds the free AI engine
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { extractReceipt } from '../services/ocr.js';
import { matchLineItems, normalize, similarity } from '../services/priceMatch.js';

const dir = process.argv[2];
const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
const engines = [
  { name: 'tesseract', env: {} },
  { name: 'openrouter', env: { OCR_API_KEY: process.env.OR_KEY, OCR_MODEL: process.env.OR_MODEL || 'openrouter/free' } },
].filter((engine) => engine.name === 'tesseract' || engine.env.OCR_API_KEY);

await mongoose.connect(process.env.MONGO_URI);

const results = [];
for (const truth of expected) {
  const buffer = fs.readFileSync(path.join(dir, truth.file));
  for (const engine of engines) {
    for (const key of ['OCR_API_KEY', 'OCR_MODEL', 'VISION_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[key];
    Object.assign(process.env, engine.env);

    const started = Date.now();
    const result = await extractReceipt({ imageBase64: buffer.toString('base64'), imageBuffer: buffer, mediaType: 'image/png' });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (result.status !== 'done') {
      results.push({ file: truth.file, engine: engine.name, status: 'failed', error: result.error, seconds });
      console.log(truth.file, engine.name, 'FAILED', result.error);
      continue;
    }

    // Score: each expected line matched by name similarity, then price checked.
    const read = result.lineItems.map((lineItem) => ({ ...lineItem, used: false }));
    let exact = 0;
    let priceWrong = 0;
    const missed = [];
    for (const want of truth.items) {
      let best = null;
      let bestScore = 0;
      for (const got of read) {
        if (got.used) continue;
        const score = similarity(normalize(want.name), normalize(got.name));
        if (score > bestScore) { bestScore = score; best = got; }
      }
      if (!best || bestScore < 0.6) { missed.push(want.name); continue; }
      best.used = true;
      if (best.price === want.price && (best.qty || 1) === want.qty) exact += 1;
      else priceWrong += 1;
    }
    const extra = read.filter((got) => !got.used).map((got) => `${got.name} ${got.price}`);

    const { potentialSavings, lineItems } = await matchLineItems(result.lineItems);
    const matchedLines = lineItems.filter((lineItem) => lineItem.priceMatch).length;

    const row = {
      file: truth.file, engine: result.engine === 'vision' ? engine.name : result.engine, seconds,
      fellBack: engine.name !== 'tesseract' && result.engine === 'tesseract' ? result.fallbackReason : null,
      store: result.store, storeOk: (result.store || '').toUpperCase().includes(truth.store.split(' ')[0].replace('-', '')) || (result.store || '').toUpperCase().includes(truth.store.split(' ')[0]),
      total: result.totalDetected, totalOk: result.totalDetected === truth.total, totalsAgree: result.totalsAgree,
      expectedLines: truth.items.length, exact, priceWrong, missed, extra, matchedLines, potentialSavings,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

fs.writeFileSync(process.env.OUT || 'compare-results.json', JSON.stringify(results, null, 2));
await mongoose.disconnect();
