import { useState } from 'react';
import { X, Plus, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { updateReceiptItem, addReceiptItem, removeReceiptItem, commitReceipt } from '../api/receipts.js';
import { formatMoney } from '../utils/format.js';
import FormError from './FormError.jsx';
import { useCategories } from '../context/CategoriesContext.jsx';

const METHODS = ['Cash', 'Bank Transfer', 'Card', 'JazzCash', 'Easypaisa', 'Raast'];

/**
 * Human-in-the-loop verification. Nothing reaches the database until the person
 * has looked at these lines and pressed save.
 */
export default function VerifyReceiptModal({ receipt: initial, groups, onClose, onCommitted }) {
  const { all: CATEGORIES } = useCategories();
  const [receipt, setReceipt] = useState(initial);
  const [target, setTarget] = useState('personal');
  const [groupId, setGroupId] = useState(groups[0]?.id || '');
  const [category, setCategory] = useState('Food');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [draft, setDraft] = useState({ name: '', qty: '1', price: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const editLine = async (index, patch) => {
    try {
      setReceipt((await updateReceiptItem(receipt.id, index, patch)).receipt);
    } catch (err) {
      toast.error(err.message || 'Could not update that line');
    }
  };

  const removeLine = async (index) => {
    setReceipt((await removeReceiptItem(receipt.id, index)).receipt);
  };

  const addLine = async (e) => {
    e.preventDefault();
    const price = Math.round(Number(draft.price)) || 0;
    if (!draft.name.trim() || price <= 0) return;
    setReceipt((await addReceiptItem(receipt.id, { name: draft.name.trim(), qty: Number(draft.qty) || 1, price })).receipt);
    setDraft({ name: '', qty: '1', price: '' });
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const body = target === 'personal' ? { target, category, paymentMethod } : { target: 'groupExpense', groupId, category };
      const result = await commitReceipt(receipt.id, body);
      toast.success(
        target === 'personal'
          ? `Saved ${formatMoney(receipt.itemsTotal)} to Personal`
          : 'Receipt ready — pick who shared each item',
      );
      onCommitted(result, target);
    } catch (err) {
      setError(err.message || 'Could not save this receipt');
    } finally {
      setSaving(false);
    }
  };

  const mismatch = receipt.totalDetected != null && receipt.totalsAgree === false;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="font-semibold">Check what we read</h2>
            <p className="text-xs text-slate-500">
              {receipt.store || 'Unknown store'} · read by {receipt.ocrEngine === 'vision' ? 'AI vision' : 'offline OCR'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <div>
            <img src={receipt.imageUrl} alt="Receipt" className="w-full rounded-xl ring-1 ring-slate-200" />
          </div>

          <div className="space-y-3">
            <FormError message={error} />

            {mismatch && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Lines add up to {formatMoney(receipt.itemsTotal)} but the receipt says {formatMoney(receipt.totalDetected)}. Fix
                the lines before saving.
              </p>
            )}

            <ul className="space-y-2">
              {receipt.lineItems.map((item, index) => (
                <li key={index} className="flex items-center gap-2">
                  <input
                    defaultValue={item.name}
                    onBlur={(e) => e.target.value !== item.name && editLine(index, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min="1"
                    defaultValue={item.qty}
                    onBlur={(e) => Number(e.target.value) !== item.qty && editLine(index, { qty: Number(e.target.value) })}
                    className="w-14 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    defaultValue={item.price}
                    onBlur={(e) => Number(e.target.value) !== item.price && editLine(index, { price: Math.round(Number(e.target.value)) })}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {item.corrected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" title="edited by you" />}
                  <button onClick={() => removeLine(index)} className="text-slate-300 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={addLine} className="flex items-center gap-2">
              <input
                placeholder="Add a missing item"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min="1"
                value={draft.qty}
                onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
                className="w-14 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min="0"
                placeholder="0"
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                className="w-24 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-sm"
              />
              <button className="text-slate-400 hover:text-emerald-600">
                <Plus className="h-4 w-4" />
              </button>
            </form>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Lines total</span>
              <span className="font-semibold">{formatMoney(receipt.itemsTotal)}</span>
            </div>
            {receipt.totalDetected != null && (
              <div className="flex items-center justify-between px-3 text-xs text-slate-400">
                <span>Printed on receipt</span>
                <span>{formatMoney(receipt.totalDetected)}</span>
              </div>
            )}
          </div>
        </div>

        <footer className="space-y-3 border-t border-slate-200 p-5">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'personal', label: 'Save to Personal' },
              { key: 'groupExpense', label: 'Use in group expense' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTarget(t.key)}
                disabled={t.key === 'groupExpense' && groups.length === 0}
                className={`rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${
                  target === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            {target === 'personal' ? (
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            ) : (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={save}
              disabled={saving || receipt.lineItems.length === 0}
              className="ml-auto rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : target === 'personal' ? 'Save to Personal' : 'Continue to expense'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
