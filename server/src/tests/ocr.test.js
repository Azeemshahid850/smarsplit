import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import tesseract from 'tesseract.js';
import { totalsAgree } from '../services/ocr.js';

// The receipt tests mock the whole OCR module, so a broken import of the
// offline engine never showed up there — until every scan on a server without a
// vision key failed with "recognize is not a function".
describe('offline OCR engine', () => {
  it('has createWorker() and the English language data installed locally', () => {
    expect(typeof tesseract.createWorker).toBe('function');
    const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json')), '4.0.0');
    expect(fs.existsSync(path.join(dir, 'eng.traineddata.gz'))).toBe(true);
  });

  it('totalsAgree tolerates 5% and handles a missing total', () => {
    const items = [{ price: 1890 }, { price: 2250 }];
    expect(totalsAgree(items, 4140)).toBe(true);
    expect(totalsAgree(items, 4300)).toBe(true);
    expect(totalsAgree(items, 5000)).toBe(false);
    expect(totalsAgree(items, null)).toBeNull();
  });
});
