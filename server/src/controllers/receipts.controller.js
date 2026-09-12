import { Receipt } from '../models/Receipt.js';
import { PersonalExpense } from '../models/PersonalExpense.js';
import { Group } from '../models/Group.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { extractReceipt, totalsAgree } from '../services/ocr.js';
import { uploadReceiptImage } from '../services/uploads.js';
import { matchLineItems } from '../services/priceMatch.js';

const publicReceipt = (r) => ({
  id: r._id,
  imageUrl: r.imageUrl,
  store: r.store,
  receiptDate: r.receiptDate,
  ocrStatus: r.ocrStatus,
  ocrEngine: r.ocrEngine,
  ocrError: r.ocrError,
  lineItems: r.lineItems,
  totalDetected: r.totalDetected,
  totalsAgree: r.totalsAgree,
  itemsTotal: r.lineItems.reduce((t, i) => t + i.price, 0),
  potentialSavings: r.potentialSavings,
  committedTo: r.committedTo,
  committedId: r.committedId,
});

/** Runs OCR in the background and writes the result back onto the receipt. */
export async function processReceipt(receiptId, buffer, mimetype) {
  const result = await extractReceipt({
    imageBase64: buffer.toString('base64'),
    imageBuffer: buffer,
    mediaType: mimetype,
  });

  if (result.status === 'failed') {
    await Receipt.findByIdAndUpdate(receiptId, { ocrStatus: 'failed', ocrError: result.error });
    return;
  }

  await Receipt.findByIdAndUpdate(receiptId, {
    ocrStatus: 'done',
    ocrEngine: result.engine,
    ocrError: result.fallbackReason,
    store: result.store,
    receiptDate: result.receiptDate,
    lineItems: result.lineItems,
    totalDetected: result.totalDetected,
    totalsAgree: result.totalsAgree,
  });
}

/**
 * Cheaper-alternative lookup. Decoupled on purpose: it runs after the commit
 * response, reads the local price book, and never blocks the UI. A live scraper
 * replaces `matchLineItems` behind the same call.
 */
export async function applyPriceMatches(receiptId, transactionId = null) {
  const receipt = await Receipt.findById(receiptId);
  if (!receipt) return;

  const { lineItems, potentialSavings, suggestedAlternatives } = await matchLineItems(
    receipt.lineItems.map((i) => i.toObject()),
  );

  // Atomic write, not load-modify-save: this runs in the background and can
  // overlap a user editing the same receipt in the verification modal.
  await Receipt.findByIdAndUpdate(receiptId, { lineItems, potentialSavings });

  if (transactionId) {
    await PersonalExpense.findByIdAndUpdate(transactionId, { potentialSavings, suggestedAlternatives });
  }
}

export async function scanReceipt(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach a receipt image', 'NO_IMAGE');

  const imageUrl = await uploadReceiptImage(req.file.buffer, req.file.mimetype);
  const receipt = await Receipt.create({ userId: req.user._id, imageUrl, ocrStatus: 'processing' });

  // Respond immediately; the client polls GET /receipts/:id.
  ok(res, { receiptId: receipt._id, status: 'processing' }, 202);

  processReceipt(receipt._id, req.file.buffer, req.file.mimetype).catch(async (err) => {
    await Receipt.findByIdAndUpdate(receipt._id, { ocrStatus: 'failed', ocrError: err.message });
  });
}

async function ownReceipt(req) {
  const receipt = await Receipt.findOne({ _id: req.params.receiptId, userId: req.user._id });
  if (!receipt) throw ApiError.notFound('Receipt not found', 'RECEIPT_NOT_FOUND');
  return receipt;
}

export async function getReceipt(req, res) {
  ok(res, { receipt: publicReceipt(await ownReceipt(req)) });
}

export async function listReceipts(req, res) {
  const receipts = await Receipt.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20);
  ok(res, { receipts: receipts.map(publicReceipt) });
}

/** A human edit — marks the line corrected so the audit trail shows it. */
export async function updateItem(req, res) {
  const receipt = await ownReceipt(req);
  const item = receipt.lineItems[req.params.index];
  if (!item) throw ApiError.notFound('That line item does not exist', 'ITEM_NOT_FOUND');

  Object.assign(item, req.body, { corrected: true });
  receipt.totalsAgree = totalsAgree(receipt.lineItems, receipt.totalDetected);
  await receipt.save();

  ok(res, { receipt: publicReceipt(receipt) });
}

export async function addItem(req, res) {
  const receipt = await ownReceipt(req);
  receipt.lineItems.push({ ...req.body, rawText: '', corrected: true });
  receipt.totalsAgree = totalsAgree(receipt.lineItems, receipt.totalDetected);
  await receipt.save();

  ok(res, { receipt: publicReceipt(receipt) }, 201);
}

export async function removeItem(req, res) {
  const receipt = await ownReceipt(req);
  if (!receipt.lineItems[req.params.index]) throw ApiError.notFound('That line item does not exist', 'ITEM_NOT_FOUND');

  receipt.lineItems.splice(req.params.index, 1);
  receipt.totalsAgree = totalsAgree(receipt.lineItems, receipt.totalDetected);
  await receipt.save();

  ok(res, { receipt: publicReceipt(receipt) });
}

/**
 * Turns a verified receipt into real data. Nothing is committed until the user
 * has been through the verification modal — this is the only path that writes.
 */
export async function commitReceipt(req, res) {
  const receipt = await ownReceipt(req);

  if (receipt.ocrStatus !== 'done') throw ApiError.badRequest('This receipt is still being read', 'RECEIPT_NOT_READY');
  if (!receipt.lineItems.length) throw ApiError.badRequest('There are no line items to save', 'NO_LINE_ITEMS');
  if (receipt.committedTo) throw ApiError.conflict('This receipt has already been saved', 'ALREADY_COMMITTED');

  const amount = receipt.lineItems.reduce((t, i) => t + i.price, 0);

  if (req.body.target === 'personal') {
    const transaction = await PersonalExpense.create({
      userId: req.user._id,
      title: receipt.store ? `${receipt.store} receipt` : 'Receipt',
      amount,
      category: req.body.category || 'Food',
      type: 'DEBIT',
      paymentMethod: req.body.paymentMethod || 'Cash',
      date: receipt.receiptDate || new Date(),
      receiptUrl: receipt.imageUrl,
    });

    receipt.committedTo = 'personal';
    receipt.committedId = transaction._id;
    await receipt.save();

    ok(res, { receipt: publicReceipt(receipt), transactionId: transaction._id }, 201);

    // Savings lookup happens after the response — it must never hold up the save.
    return applyPriceMatches(receipt._id, transaction._id).catch((err) =>
      console.error('price match failed:', err.message),
    );
  }

  // Group target: hand back a ready-made LINE_ITEM draft rather than writing the
  // expense here, so the user still picks who shared what.
  const group = await Group.findById(req.body.groupId);
  if (!group?.memberFor(req.user._id)) throw ApiError.forbidden('You are not a member of that group', 'NOT_A_MEMBER');

  const members = group.members.filter((m) => m.status === 'active' && m.user).map((m) => String(m.user));

  ok(res, {
    draft: {
      groupId: group._id,
      title: receipt.store ? `${receipt.store} receipt` : 'Receipt',
      totalAmount: amount,
      category: req.body.category || 'Food',
      date: receipt.receiptDate || new Date(),
      splitType: 'LINE_ITEM',
      receiptImage: receipt.imageUrl,
      items: receipt.lineItems.map((i) => ({ name: i.name, qty: i.qty, price: i.price, sharedBy: members })),
    },
  });
}

export { publicReceipt };
