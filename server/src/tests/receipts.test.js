import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// The vision call is stubbed — the flow under test is upload → poll → verify →
// commit, not the model itself. `totalsAgree` stays real.
const extractReceipt = vi.fn();
vi.mock('../services/ocr.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, extractReceipt: (...args) => extractReceipt(...args) };
});

const app = (await import('../app.js')).default;
const { makeUser, makeGroup } = await import('./helpers.js');
const { totalsAgree } = await import('../services/ocr.js');
const { PersonalExpense } = await import('../models/PersonalExpense.js');

const api = '/api/v1';
const IMAGE = Buffer.from('fake-jpeg-bytes');

const scan = (user) =>
  request(app).post(`${api}/receipts/scan`).set('Authorization', `Bearer ${user.accessToken}`).attach('image', IMAGE, 'receipt.jpg');

const get = (user, url) => request(app).get(url).set('Authorization', `Bearer ${user.accessToken}`);

// The controller finishes OCR after responding, so poll like the real client does.
async function waitForOcr(user, receiptId) {
  for (let i = 0; i < 40; i += 1) {
    const res = await get(user, `${api}/receipts/${receiptId}`);
    if (res.body.data.receipt.ocrStatus !== 'processing') return res.body.data.receipt;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('OCR never finished');
}

const GROCERIES = {
  status: 'done',
  engine: 'vision',
  store: 'Imtiaz Super Market',
  receiptDate: new Date('2026-09-05'),
  lineItems: [
    { rawText: 'Cooking Oil 3L 1890', name: 'Cooking Oil 3L', qty: 1, price: 1890 },
    { rawText: 'Basmati Rice 5kg 2100', name: 'Basmati Rice 5kg', qty: 1, price: 2100 },
    { rawText: 'Milk 1L x2 440', name: 'Milk 1L', qty: 2, price: 440 },
  ],
  totalDetected: 4430,
  totalsAgree: true,
  fallbackReason: null,
};

beforeEach(() => {
  extractReceipt.mockReset();
  extractReceipt.mockResolvedValue(GROCERIES);
});

describe('totalsAgree', () => {
  it('accepts a 5% gap and rejects more', () => {
    expect(totalsAgree([{ price: 100 }, { price: 100 }], 200)).toBe(true);
    expect(totalsAgree([{ price: 100 }, { price: 100 }], 205)).toBe(true); // 2.4% off
    expect(totalsAgree([{ price: 100 }], 200)).toBe(false); // 50% off
  });

  it('returns null when the receipt printed no total', () => {
    expect(totalsAgree([{ price: 100 }], null)).toBe(null);
  });
});

describe('POST /receipts/scan', () => {
  it('accepts the image, answers 202 immediately, then finishes in the background', async () => {
    const user = await makeUser();
    const res = await scan(user);

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: 'processing', receiptId: expect.any(String) });

    const receipt = await waitForOcr(user, res.body.data.receiptId);
    expect(receipt.ocrStatus).toBe('done');
    expect(receipt.ocrEngine).toBe('vision');
    expect(receipt.store).toBe('Imtiaz Super Market');
    expect(receipt.lineItems).toHaveLength(3);
    expect(receipt.itemsTotal).toBe(4430);
    expect(receipt.totalsAgree).toBe(true);
  });

  it('records a failure instead of throwing', async () => {
    extractReceipt.mockResolvedValue({ status: 'failed', error: 'No vision API key configured; tesseract: no text' });
    const user = await makeUser();

    const receipt = await waitForOcr(user, (await scan(user)).body.data.receiptId);
    expect(receipt.ocrStatus).toBe('failed');
    expect(receipt.ocrError).toMatch('No vision API key');
  });

  it('rejects a non-image upload', async () => {
    const user = await makeUser();
    const res = await request(app)
      .post(`${api}/receipts/scan`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .attach('image', Buffer.from('%PDF-1.4'), { filename: 'receipt.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_FILE_TYPE');
  });

  it('rejects a request with no file', async () => {
    const user = await makeUser();
    const res = await request(app).post(`${api}/receipts/scan`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_IMAGE');
  });

  it('401s without a token', async () => {
    expect((await request(app).post(`${api}/receipts/scan`).attach('image', IMAGE, 'r.jpg')).status).toBe(401);
  });
});

describe('human-in-the-loop verification', () => {
  it('marks an edited line corrected and re-checks the totals', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .patch(`${api}/receipts/${id}/items/0`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ price: 1745, name: 'Cooking Oil 3 litre' });

    expect(res.status).toBe(200);
    expect(res.body.data.receipt.lineItems[0]).toMatchObject({ name: 'Cooking Oil 3 litre', price: 1745, corrected: true });
    expect(res.body.data.receipt.itemsTotal).toBe(4285);
    expect(res.body.data.receipt.totalsAgree).toBe(true); // still within 5% of 4430
  });

  it('flags totals that stop agreeing after an edit', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .patch(`${api}/receipts/${id}/items/1`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ price: 100 });

    expect(res.body.data.receipt.totalsAgree).toBe(false);
  });

  it('adds and removes lines', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const added = await request(app)
      .post(`${api}/receipts/${id}/items`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Tea 500g', qty: 1, price: 900 });
    expect(added.body.data.receipt.lineItems).toHaveLength(4);

    const removed = await request(app).delete(`${api}/receipts/${id}/items/3`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(removed.body.data.receipt.lineItems).toHaveLength(3);
  });

  it('404s an index that does not exist', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .patch(`${api}/receipts/${id}/items/9`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ price: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('never shows one user another user receipt', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    const { id } = await waitForOcr(mine, (await scan(mine)).body.data.receiptId);

    expect((await get(theirs, `${api}/receipts/${id}`)).status).toBe(404);
    expect((await get(theirs, `${api}/receipts`)).body.data.receipts).toEqual([]);
  });
});

describe('POST /receipts/:id/commit', () => {
  it('writes a personal transaction from the verified lines', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .post(`${api}/receipts/${id}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'personal', category: 'Food', paymentMethod: 'Easypaisa' });

    expect(res.status).toBe(201);

    const transaction = await PersonalExpense.findById(res.body.data.transactionId);
    expect(transaction).toMatchObject({ amount: 4430, category: 'Food', paymentMethod: 'Easypaisa', type: 'DEBIT' });
    expect(transaction.receiptUrl).toBeTruthy();
  });

  it('refuses to commit the same receipt twice', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);
    const commit = () =>
      request(app).post(`${api}/receipts/${id}/commit`).set('Authorization', `Bearer ${user.accessToken}`).send({ target: 'personal' });

    await commit();
    const again = await commit();
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_COMMITTED');
  });

  it('refuses to commit a receipt that is still processing or failed', async () => {
    extractReceipt.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = await makeUser();
    const { receiptId } = (await scan(user)).body.data;

    const res = await request(app)
      .post(`${api}/receipts/${receiptId}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'personal' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RECEIPT_NOT_READY');
    expect(await PersonalExpense.countDocuments({ userId: user.id })).toBe(0); // nothing auto-committed
  });

  it('returns a LINE_ITEM draft for a group instead of writing the expense', async () => {
    const user = await makeUser();
    const friend = await makeUser();
    const group = await makeGroup(user, { memberEmails: [friend.email] });
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .post(`${api}/receipts/${id}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'groupExpense', groupId: group.id });

    expect(res.status).toBe(200);
    expect(res.body.data.draft).toMatchObject({ splitType: 'LINE_ITEM', totalAmount: 4430 });
    expect(res.body.data.draft.items).toHaveLength(3);
    expect(res.body.data.draft.items[0].sharedBy).toHaveLength(2); // everyone by default
  });

  it('403s a group the user does not belong to', async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const group = await makeGroup(stranger);
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .post(`${api}/receipts/${id}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'groupExpense', groupId: group.id });

    expect(res.status).toBe(403);
  });

  it('requires a groupId when targeting a group', async () => {
    const user = await makeUser();
    const { id } = await waitForOcr(user, (await scan(user)).body.data.receiptId);

    const res = await request(app)
      .post(`${api}/receipts/${id}/commit`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ target: 'groupExpense' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
