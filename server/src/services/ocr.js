import { createRequire } from 'node:module';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

// What the vision model must return — enforced by structured outputs, so the
// response cannot come back as prose or half-JSON.
const ReceiptSchema = z.object({
  store: z.string().nullable().describe('Shop name printed on the receipt'),
  date: z.string().nullable().describe('Receipt date as YYYY-MM-DD if printed'),
  items: z.array(
    z.object({
      name: z.string().describe('Item name as printed, cleaned of SKU codes'),
      qty: z.number().describe('Quantity, 1 when not printed'),
      price: z.number().describe('Line total in rupees, not the unit price'),
    }),
  ),
  total: z.number().nullable().describe('Grand total printed on the receipt, in rupees'),
});

const PROMPT = `Read this shop receipt and extract its line items.

Rules:
- Amounts are Pakistani rupees. Return whole numbers, no currency symbols or commas.
- "price" is the line total for that row, not the unit price.
- Skip subtotals, tax lines, discounts and the grand total — they are not items.
- If the quantity is not printed, use 1.
- If a field is genuinely not on the receipt, use null rather than guessing.`;

const VISION_MODEL = 'claude-opus-5-5';

// Same shape, but lenient: free OpenAI-compatible models often return numbers
// as strings or wrap the JSON in a code fence.
const LooseReceiptSchema = z.object({
  store: z.string().nullish(),
  date: z.string().nullish(),
  items: z
    .array(z.object({ name: z.string(), qty: z.coerce.number().nullish(), price: z.coerce.number() }))
    .default([]),
  total: z.coerce.number().nullish(),
});

const JSON_SHAPE = `

Respond with JSON only, no prose, exactly this shape:
{"store": string|null, "date": "YYYY-MM-DD"|null, "items": [{"name": string, "qty": number, "price": number}], "total": number|null}`;

/** Pulls the first {...} out of a reply that may carry prose or a code fence. */
function extractJson(text = '') {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('OCR API reply had no JSON');
  return JSON.parse(unfenced.slice(start, end + 1));
}

/**
 * Any OpenAI-compatible chat endpoint with image input: OpenRouter (free
 * models), Google AI Studio's OpenAI endpoint (free Gemini tier), Groq, etc.
 * Configured with OCR_API_BASE, OCR_API_KEY, OCR_MODEL. Plain fetch — no SDK.
 */
export async function extractWithOpenAICompatible(imageBase64, mediaType = 'image/jpeg') {
  const base = (process.env.OCR_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  // "openrouter/free" is OpenRouter's router: it picks a free model that
  // accepts images, so nobody has to track which :free models exist this week.
  const model = process.env.OCR_MODEL || 'openrouter/free';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OCR_API_KEY}`,
      // OpenRouter attribution headers; harmless elsewhere.
      'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5173',
      'X-Title': 'SmartSplit',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
            { type: 'text', text: PROMPT + JSON_SHAPE },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) throw new Error(`OCR API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('OCR API reply had no message content');

  const parsed = LooseReceiptSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error(`OCR API JSON did not match: ${parsed.error.issues[0]?.message}`);
  return { ...parsed.data, engine: 'vision' };
}

/** Vision LLM extraction. Throws so the caller can fall back to Tesseract. */
export async function extractWithVision(imageBase64, mediaType = 'image/jpeg') {
  const client = new Anthropic({ apiKey: process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.parse({
    model: VISION_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ReceiptSchema) },
  });

  if (!response.parsed_output) throw new Error('Vision model returned no structured output');
  return { ...response.parsed_output, engine: 'vision' };
}

// Lines like "Cooking Oil 3L    1,745" or "2 x Milk 220".
const LINE = /^(?<qty>\d+)?\s*[xX*]?\s*(?<name>[A-Za-z][A-Za-z0-9 .'&/-]{2,40}?)\s+(?:rs\.?\s*)?(?<price>[\d,]+(?:\.\d{1,2})?)$/i;
const SKIP = /(sub\s*total|total|tax|gst|discount|change|cash|card|balance|thank)/i;

// English language data ships as an npm package, so OCR never fetches from a
// CDN at runtime — the default does, which is an 11 MB download on every cold
// start and a hard crash of the process when the download fails.
const TESSDATA_DIR = path.join(path.dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json')), '4.0.0');

/** Offline fallback: Tesseract text plus a line-shape regex. */
export async function extractWithTesseract(imageBuffer) {
  const { createWorker } = await import('tesseract.js');
  // errorHandler matters: without it the worker rethrows on process.nextTick
  // and takes the API down with it instead of failing this one scan.
  const worker = await createWorker('eng', 1, {
    langPath: TESSDATA_DIR,
    cacheMethod: 'none',
    errorHandler: (err) => console.error('tesseract worker:', err?.message ?? err),
  });

  let data;
  try {
    ({ data } = await worker.recognize(imageBuffer));
  } finally {
    await worker.terminate().catch(() => {});
  }

  const items = [];
  let total = null;
  let store = null;

  for (const [index, raw] of data.text.split('\n').entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (!store && index < 3 && /[A-Za-z]{3}/.test(line)) store = line.slice(0, 60);

    const totalMatch = line.match(/(?:grand\s*)?total\D{0,5}([\d,]+(?:\.\d{1,2})?)/i);
    if (totalMatch) {
      total = Math.round(Number(totalMatch[1].replace(/,/g, '')));
      continue;
    }
    if (SKIP.test(line)) continue;

    const match = line.match(LINE);
    if (!match) continue;

    const price = Math.round(Number(match.groups.price.replace(/,/g, '')));
    if (!price) continue;

    items.push({ rawText: line, name: match.groups.name.trim(), qty: Number(match.groups.qty || 1), price });
  }

  return { store, date: null, items, total, engine: 'tesseract' };
}

/** Do the extracted lines add up to the printed total, within 5%? */
export function totalsAgree(items, total) {
  if (!total) return null;
  const summed = items.reduce((runningTotal, lineItem) => runningTotal + lineItem.price, 0);
  return Math.abs(summed - total) <= total * 0.05;
}

/**
 * Vision first, Tesseract if it fails — the shape returned is identical either way.
 * Never throws: a failure is reported as `{ status: 'failed' }` so the receipt row
 * can record it.
 */
export async function extractReceipt({ imageBase64, imageBuffer, mediaType }) {
  let result;
  let error = null;

  try {
    if (process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY) {
      result = await extractWithVision(imageBase64, mediaType);
    } else if (process.env.OCR_API_KEY) {
      result = await extractWithOpenAICompatible(imageBase64, mediaType);
    } else {
      throw new Error('No vision API key configured');
    }
  } catch (visionError) {
    error = visionError.message;
    try {
      result = await extractWithTesseract(imageBuffer);
    } catch (tesseractError) {
      return { status: 'failed', error: `${error}; tesseract: ${tesseractError.message}` };
    }
  }

  const items = result.items
    .map((lineItem) => ({ rawText: lineItem.rawText ?? '', name: lineItem.name, qty: Math.max(1, Math.round(lineItem.qty || 1)), price: Math.round(lineItem.price) }))
    .filter((lineItem) => lineItem.name && lineItem.price > 0);

  return {
    status: 'done',
    engine: result.engine,
    store: result.store,
    receiptDate: result.date ? new Date(result.date) : null,
    lineItems: items,
    totalDetected: result.total ? Math.round(result.total) : null,
    totalsAgree: totalsAgree(items, result.total),
    fallbackReason: result.engine === 'tesseract' ? error : null,
  };
}
