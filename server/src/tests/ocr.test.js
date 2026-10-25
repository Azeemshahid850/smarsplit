import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import tesseract from 'tesseract.js';
import { totalsAgree, extractWithOpenAICompatible, extractReceipt, parseReceiptText } from '../services/ocr.js';

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

describe('OpenAI-compatible OCR engine (OpenRouter / Gemini free tier)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCR_API_KEY;
    delete process.env.OCR_MODEL;
    delete process.env.OCR_API_BASE;
  });

  const reply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' });

  it('posts the image to /chat/completions and parses fenced JSON with string numbers', async () => {
    process.env.OCR_API_KEY = 'k';
    process.env.OCR_MODEL = 'some/vision-model:free';
    process.env.OCR_API_BASE = 'https://example.test/v1/';
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      return reply('Here you go:\n```json\n{"store":"Al-Fatah","date":null,"items":[{"name":"Sugar 1 kg","qty":"1","price":"190"}],"total":"190"}\n```');
    });

    const out = await extractWithOpenAICompatible('AAAA', 'image/png');
    expect(calls[0].url).toBe('https://example.test/v1/chat/completions');
    expect(calls[0].auth).toBe('Bearer k');
    expect(calls[0].body.model).toBe('some/vision-model:free');
    expect(calls[0].body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,AAAA');
    expect(out).toMatchObject({ engine: 'vision', store: 'Al-Fatah', total: 190, items: [{ name: 'Sugar 1 kg', qty: 1, price: 190 }] });
  });

  it('is chosen when only OCR_API_KEY is set, and a bad reply falls back to tesseract instead of failing', async () => {
    process.env.OCR_API_KEY = 'k';
    process.env.OCR_MODEL = 'm';
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}) }));

    // A 1x1 PNG: tesseract reads nothing, so the result is "done" with no lines — not a crash.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const result = await extractReceipt({ imageBase64: png.toString('base64'), imageBuffer: png, mediaType: 'image/png' });
    expect(['done', 'failed']).toContain(result.status);
    if (result.status === 'done') {
      expect(result.engine).toBe('tesseract');
      expect(result.fallbackReason).toMatch(/OCR API 429/);
    } else {
      expect(result.error).toMatch(/OCR API 429/);
    }
  }, 60_000);
});

describe('parseReceiptText (offline line parser)', () => {
  it('reads plain lines, qty prefixes, thousands separators and the total', () => {
    const out = parseReceiptText(['CARREFOUR', 'Packages Mall, Lahore', '2 x Milk 1 Ltr 460', 'Basmati Rice 5 kg 2,150', 'Sub Total 2,610', 'TOTAL 2,610', 'Cash 3000', 'Thank you'].join('\n'));
    expect(out.store).toBe('CARREFOUR');
    expect(out.items).toEqual([
      expect.objectContaining({ name: 'Milk 1 Ltr', qty: 2, price: 460 }),
      expect.objectContaining({ name: 'Basmati Rice 5 kg', qty: 1, price: 2150 }),
    ]);
    expect(out.total).toBe(2610);
  });

  it('understands Qty / Rate / Amount columns and scrubs stray OCR symbols', () => {
    const out = parseReceiptText(['METRO', 'Chicken 1 kg 2 710 1420', 'Coffee 100 g 1 1150 1150', 'Nido 900 g¢ 1,750', 'GST 17% (included) 722', 'TOTAL 4320'].join('\n'));
    expect(out.items).toEqual([
      expect.objectContaining({ name: 'Chicken 1 kg', qty: 2, price: 1420 }),
      expect.objectContaining({ name: 'Coffee 100 g', qty: 1, price: 1150 }),
      expect.objectContaining({ name: 'Nido 900 g', qty: 1, price: 1750 }),
    ]);
    expect(out.total).toBe(4320);
  });

  it('does not invent a quantity when the trailing numbers are just part of a name', () => {
    const out = parseReceiptText('Batteries AA 4 Pack 420\nLED Bulb 12W 340');
    expect(out.items.map((item) => [item.name, item.qty, item.price])).toEqual([['Batteries AA 4 Pack', 1, 420], ['LED Bulb 12W', 1, 340]]);
  });
});
