import mongoose from 'mongoose';

const priceMatchSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    onlinePrice: { type: Number, required: true },
    url: { type: String, default: null },
    checkedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const lineItemSchema = new mongoose.Schema(
  {
    rawText: { type: String, default: '' },
    name: { type: String, required: true },
    qty: { type: Number, default: 1 },
    price: { type: Number, required: true },
    // Flipped the moment a human edits the line — the audit trail for
    // "the AI read it wrong and I fixed it".
    corrected: { type: Boolean, default: false },
    priceMatch: { type: priceMatchSchema, default: null },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    imageUrl: { type: String, required: true },
    store: { type: String, default: null },
    receiptDate: { type: Date, default: null },
    ocrStatus: { type: String, enum: ['processing', 'done', 'failed'], default: 'processing' },
    ocrEngine: { type: String, enum: ['vision', 'tesseract', null], default: null },
    ocrError: { type: String, default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    totalDetected: { type: Number, default: null },
    // False when the line items do not add up to the printed total within 5%.
    totalsAgree: { type: Boolean, default: null },
    potentialSavings: { type: Number, default: 0 },
    committedTo: { type: String, enum: ['personal', 'groupExpense', null], default: null },
    committedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

export const Receipt = mongoose.model('Receipt', receiptSchema);
