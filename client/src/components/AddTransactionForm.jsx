import { useState } from 'react';
import { createTransaction } from '../api/personal.js';
import Field from './Field.jsx';
import SubmitButton from './SubmitButton.jsx';
import FormError from './FormError.jsx';

const CATEGORIES = ['Food', 'Utilities', 'Travel', 'Shopping', 'Healthcare', 'Housing', 'Misc'];
const METHODS = ['Cash', 'Bank Transfer', 'Card', 'JazzCash', 'Easypaisa', 'Raast'];
const today = () => new Date().toISOString().slice(0, 10);

const blank = {
  type: 'DEBIT',
  title: '',
  amount: '',
  date: today(),
  category: 'Food',
  paymentMethod: 'Cash',
  note: '',
  isRecurring: false,
  recurringInterval: 'monthly',
};

export default function AddTransactionForm({ onAdded }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const amount = Math.round(Number(form.amount)) || 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createTransaction({
        title: form.title.trim(),
        amount,
        type: form.type,
        category: form.category,
        paymentMethod: form.paymentMethod,
        date: form.date,
        note: form.note,
        isRecurring: form.isRecurring,
        recurringInterval: form.isRecurring ? form.recurringInterval : null,
      });
      setForm({ ...blank, type: form.type });
      await onAdded();
    } catch (err) {
      setError(err.message || 'Could not save that transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200" noValidate>
      <FormError message={error} />

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {[
          { key: 'DEBIT', label: 'Spent' },
          { key: 'CREDIT', label: 'Received' },
        ].map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setForm((f) => ({ ...f, type: t.key }))}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
              form.type === t.key ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label="Title" name="title" required value={form.title} onChange={change} placeholder="Groceries" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (Rs)" name="amount" type="number" min="1" step="1" required value={form.amount} onChange={change} />
        <Field label="Date" name="date" type="date" value={form.date} onChange={change} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select name="category" value={form.category} onChange={change} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Payment method</span>
          <select name="paymentMethod" value={form.paymentMethod} onChange={change} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isRecurring}
            onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
          />
          <span className="font-medium text-slate-700">Repeats</span>
        </label>
        {form.isRecurring && (
          <select
            name="recurringInterval"
            value={form.recurringInterval}
            onChange={change}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="monthly">Every month</option>
            <option value="weekly">Every week</option>
          </select>
        )}
      </div>

      <Field label="Note" name="note" value={form.note} onChange={change} placeholder="Optional" />

      <SubmitButton loading={saving} disabled={form.title.trim().length < 2 || amount <= 0}>
        Add transaction
      </SubmitButton>
    </form>
  );
}
