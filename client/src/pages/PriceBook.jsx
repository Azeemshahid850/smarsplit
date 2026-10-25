import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Store, Plus, X, Lock, ExternalLink, Upload, Download, FileSpreadsheet, Database } from 'lucide-react';
import { toast } from 'sonner';
import { listPrices, upsertPrice, deletePrice, importPrices, downloadPriceBook, seedDefaultPrices } from '../api/prices.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const UNITS = ['', 'g', 'kg', 'ml', 'L', 'pcs'];
export const storeLabel = (name = '') => name.charAt(0).toUpperCase() + name.slice(1);

const EMPTY = { canonicalName: '', platform: '', price: '', size: '', unit: '', aliases: '', url: '' };

/** Add or update one store's price for a product. New store names just work. */
function AddPriceForm({ products, stores, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  // Picking an existing product fills in its size, so the sizes stay consistent.
  const pickProduct = (event) => {
    const known = products.find((productRow) => productRow.canonicalName === event.target.value);
    setForm((current) => ({
      ...current,
      canonicalName: event.target.value,
      ...(known ? { size: known.size ?? '', unit: known.unit ?? '' } : {}),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const saved = await upsertPrice({
        canonicalName: form.canonicalName.trim(),
        platform: form.platform.trim(),
        price: Math.round(Number(form.price)),
        size: form.size === '' ? null : Number(form.size),
        unit: form.unit || null,
        aliases: form.aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
        url: form.url.trim() || null,
      });
      toast.success(`${saved.price.canonicalName} · ${storeLabel(saved.price.platform)} · ${formatMoney(saved.price.price)}`);
      setForm((current) => ({ ...EMPTY, platform: current.platform }));
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save that price');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200" noValidate>
      <div>
        <h2 className="flex items-center gap-2 font-medium">
          <Plus className="h-4 w-4 text-slate-400" /> Add a price
        </h2>
        <p className="text-xs text-slate-400">
          Same product and store again? It updates the existing price. A store name nobody has used yet creates that store.
        </p>
      </div>
      <FormError message={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" name="canonicalName" list="pricebook-products" required value={form.canonicalName} onChange={pickProduct} placeholder="Cooking Oil 3L" />
        <Field label="Store" name="platform" list="pricebook-stores" required value={form.platform} onChange={change} placeholder="Metro, Imtiaz, Daraz, Carrefour…" />
      </div>
      <datalist id="pricebook-products">
        {products.map((productRow) => (
          <option key={productRow.canonicalName} value={productRow.canonicalName} />
        ))}
      </datalist>
      <datalist id="pricebook-stores">
        {stores.map((storeName) => (
          <option key={storeName} value={storeName} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price (Rs)" name="price" type="number" min="1" step="1" required value={form.price} onChange={change} />
        <Field label="Pack size" name="size" type="number" min="0" step="any" value={form.size} onChange={change} placeholder="3" hint="So 3L is never compared with 5L" />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Unit</span>
          <select name="unit" value={form.unit} onChange={change} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {UNITS.map((unitOption) => (
              <option key={unitOption} value={unitOption}>{unitOption || '—'}</option>
            ))}
          </select>
        </label>
      </div>

      <Field label="Also known as" name="aliases" value={form.aliases} onChange={change} placeholder="oil, dalda, sunflower oil" hint="Comma-separated. How receipts print it — helps the matcher." />
      <Field label="Link" name="url" type="url" value={form.url} onChange={change} placeholder="https://… (optional)" />

      <SubmitButton loading={saving} disabled={!form.canonicalName.trim() || !form.platform.trim() || !(Number(form.price) > 0)}>
        Save price
      </SubmitButton>
    </form>
  );
}

/** Bulk path: download the book as Excel, edit it, upload it back. */
function SheetTools({ canEdit, onImported, isEmpty }) {
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const loadDefaults = async () => {
    const ok = await confirm({
      title: 'Load the default catalogue?',
      description: isEmpty
        ? 'Adds about 100 common grocery products with indicative prices for Daraz, Metro, Imtiaz, Al-Fatah, Carrefour, Naheed and Chase Up.'
        : 'This REPLACES every price in the book with the bundled ~100-product catalogue. Download Excel first if you want to keep what is here.',
      confirmLabel: isEmpty ? 'Load' : 'Replace everything',
      tone: isEmpty ? 'default' : undefined,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const summary = await seedDefaultPrices();
      toast.success(`Loaded ${summary.products} products (${summary.rows} prices)`);
      onImported();
    } catch (err) {
      toast.error(err.message || 'Could not load the catalogue');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadPriceBook();
    } catch (err) {
      toast.error(err.message || 'Could not download the price book');
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const summary = await importPrices(file);
      setResult(summary);
      toast.success(`${summary.added} added, ${summary.updated} updated${summary.skipped.length ? `, ${summary.skipped.length} skipped` : ''}`);
      onImported();
    } catch (err) {
      toast.error(err.message || 'Could not import that file');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 font-medium">
        <FileSpreadsheet className="h-4 w-4 text-slate-400" /> Excel
      </h2>
      <p className="text-xs text-slate-400">
        {canEdit
          ? 'Download the book, edit or add rows in Excel, upload it back. Columns: Product, Store, Price, Pack size, Unit, Also known as, Link. CSV works too.'
          : 'Download the whole book as a spreadsheet.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
          <Download className="h-4 w-4 text-slate-400" /> Download Excel
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" /> {busy ? 'Importing…' : 'Upload Excel / CSV'}
            </button>
            <input ref={fileInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
            <button
              onClick={loadDefaults}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
            >
              <Database className="h-4 w-4 text-slate-400" /> {isEmpty ? 'Load default catalogue' : 'Reset to default catalogue'}
            </button>
          </>
        )}
      </div>

      {result && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            <span className="font-medium text-slate-800">{result.added}</span> added ·{' '}
            <span className="font-medium text-slate-800">{result.updated}</span> updated ·{' '}
            <span className="font-medium text-slate-800">{result.skipped.length}</span> skipped
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-amber-800">
              {result.skipped.slice(0, 10).map((skippedRow) => (
                <li key={skippedRow.row}>
                  Row {skippedRow.row}: {skippedRow.reason}
                </li>
              ))}
              {result.skipped.length > 10 && <li>…and {result.skipped.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function PriceBook() {
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(listPrices);
  const [query, setQuery] = useState('');
  const [store, setStore] = useState('');

  const products = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.products.filter(
      (productRow) =>
        (!store || productRow.prices.some((priceRow) => priceRow.platform === store)) &&
        (!q || productRow.canonicalName.toLowerCase().includes(q) || productRow.aliases.some((alias) => alias.includes(q))),
    );
  }, [data, query, store]);

  const remove = async (productRow, priceRow) => {
    const ok = await confirm({
      title: `Remove ${storeLabel(priceRow.platform)}'s price for ${productRow.canonicalName}?`,
      description: 'Receipts will no longer be compared against it.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await deletePrice(priceRow.id);
      await reload();
      toast.success('Price removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove that price');
    }
  };

  if (loading) return <Loading label="Loading the price book…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <Link to="/scan" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Scan
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Price book</h1>
          <p className="text-sm text-slate-500">
            What ExpenseAI compares your receipts against — {data.products.length} products across {data.stores.length} stores.
          </p>
        </div>
        {!data.canEdit && (
          <p className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            <Lock className="h-3.5 w-3.5" /> Read-only · a price-book admin can add stores and prices
          </p>
        )}
      </div>

      <div className={`mt-6 grid gap-4 ${data.canEdit ? 'lg:grid-cols-[1fr_minmax(0,22rem)]' : ''}`}>
        {data.canEdit && <AddPriceForm products={data.products} stores={data.stores} onSaved={reload} />}
        <SheetTools canEdit={data.canEdit} onImported={reload} isEmpty={data.products.length === 0} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products or how receipts print them"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={() => setStore('')}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${!store ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Store className="h-3 w-3" /> All stores
        </button>
        {data.stores.map((storeName) => (
          <button
            key={storeName}
            onClick={() => setStore(storeName === store ? '' : storeName)}
            className={`rounded-full px-3 py-1.5 text-xs ${store === storeName ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {storeLabel(storeName)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {products.length === 0 ? (
          <EmptyState
            title={data.products.length === 0 ? 'The price book is empty' : 'Nothing matches'}
            hint={data.products.length === 0 ? 'Add the first product and store above, or load the default catalogue.' : 'Try another spelling, or clear the store filter.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {products.map((productRow) => {
              const cheapest = productRow.prices[0]; // server sorts each product by price
              return (
                <li key={productRow.canonicalName} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium text-slate-800">{productRow.canonicalName}</p>
                    <p className="truncate text-xs text-slate-400">{productRow.aliases.slice(0, 4).join(' · ') || '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {productRow.prices.map((priceRow) => (
                      <span
                        key={priceRow.id}
                        title={`Updated ${formatDate(priceRow.updatedAt)}`}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                          priceRow.id === cheapest.id ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
                        }`}
                      >
                        <span className="font-medium">{storeLabel(priceRow.platform)}</span>
                        {formatMoney(priceRow.price)}
                        {priceRow.url && (
                          <a href={priceRow.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700" title="Open listing">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {data.canEdit && (
                          <button onClick={() => remove(productRow, priceRow)} className="text-slate-300 hover:text-red-600" title="Remove this price">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
