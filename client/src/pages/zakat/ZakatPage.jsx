import { useState } from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { getZakatOverview, calculateZakat, saveMetalRates } from '../../api/zakat.js';
import { createTransaction } from '../../api/personal.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { Loading, ErrorState } from '../../components/ui/States.jsx';
import Field from '../../components/ui/Field.jsx';
import SubmitButton from '../../components/ui/SubmitButton.jsx';
import FormError from '../../components/ui/FormError.jsx';
import { formatMoney, formatDate } from '../../utils/format.js';
import PageHeader from '../../components/ui/PageHeader.jsx';

const BLANK = { cash: '', bank: '', goals: '', goldTola: '', silverTola: '', business: '', investments: '', receivables: '', groupDebts: '', otherDebts: '', goldPerTola: '', silverPerTola: '' };
const rupees = (value) => Math.round(Number(value) || 0);
const tola = (value) => Math.round((Number(value) || 0) * 100) / 100;
const fromApp = (amount) => (amount > 0 ? String(amount) : '');

function RatesEditor({ rates, onSaved }) {
  const [form, setForm] = useState({ goldPerTola: rates?.goldPerTola ?? '', silverPerTola: rates?.silverPerTola ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const body = { goldPerTola: rupees(form.goldPerTola), silverPerTola: rupees(form.silverPerTola) };
    if (!(body.goldPerTola > 0 && body.silverPerTola > 0)) return setError('Enter both prices in whole rupees');
    setError('');
    setSaving(true);
    try {
      const { rates: saved } = await saveMetalRates(body);
      onSaved(saved);
      toast.success('Gold and silver prices saved for everyone');
    } catch (err) {
      setError(err.message || 'Could not save the prices');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 bg-slate-50 p-5 panel" noValidate>
      <div>
        <p className="text-sm font-medium text-slate-700">Admin: bazaar (sarafa) prices for everyone</p>
        <p className="text-xs text-slate-500">Used instead of the international rate until it next refreshes, about twice a day.</p>
      </div>
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gold, Rs per tola" name="adminGold" type="number" min="1" step="1" value={form.goldPerTola} onChange={set('goldPerTola')} />
        <Field label="Silver, Rs per tola" name="adminSilver" type="number" min="1" step="1" value={form.silverPerTola} onChange={set('silverPerTola')} />
      </div>
      <SubmitButton loading={saving}>Save prices</SubmitButton>
    </form>
  );
}

export default function ZakatPage() {
  const overview = useAsync(() => getZakatOverview(), []);
  if (overview.loading) return <Loading label="Gathering your figures…" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  return <ZakatForm data={overview.data} onRatesSaved={(rates) => overview.setData({ ...overview.data, rates })} />;
}

function ZakatForm({ data, onRatesSaved }) {
  const { known, rates, source, canEditRates } = data;
  const confirm = useConfirm();
  // Start with what the app already knows; the user can change any of it.
  const [form, setForm] = useState(() => ({
    ...BLANK,
    goals: fromApp(known.goalsSaved),
    receivables: fromApp(known.owedToYou),
    groupDebts: fromApp(known.youOwe),
  }));
  const [basis, setBasis] = useState('silver');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setResult(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (Object.values(form).some((value) => Number(value) < 0)) return setError('Amounts cannot be negative');
    setError('');
    setWorking(true);
    try {
      const body = {
        cash: rupees(form.cash) + rupees(form.goals),
        bank: rupees(form.bank),
        goldTola: tola(form.goldTola),
        silverTola: tola(form.silverTola),
        business: rupees(form.business),
        investments: rupees(form.investments),
        receivables: rupees(form.receivables),
        debts: rupees(form.groupDebts) + rupees(form.otherDebts),
        nisabBasis: basis,
        ...(rupees(form.goldPerTola) > 0 && { goldPerTola: rupees(form.goldPerTola) }),
        ...(rupees(form.silverPerTola) > 0 && { silverPerTola: rupees(form.silverPerTola) }),
      };
      setResult((await calculateZakat(body)).result);
      setRecorded(false);
    } catch (err) {
      setError(err.message || 'Could not work out the zakat');
    } finally {
      setWorking(false);
    }
  };

  const record = async () => {
    const year = new Date().getFullYear();
    const yes = await confirm({
      title: `Record ${formatMoney(result.zakat)} as paid?`,
      description: `It is added to Personal as "Zakat ${year}", money out, paid in cash. You can change it there.`,
      confirmLabel: 'Record',
      tone: 'neutral',
    });
    if (!yes) return;
    try {
      await createTransaction({ title: `Zakat ${year}`, amount: result.zakat, type: 'DEBIT', category: 'Misc', paymentMethod: 'Cash' });
      setRecorded(true);
      toast.success(`Zakat ${year} recorded in Personal`);
    } catch (err) {
      toast.error(err.message || 'Could not record the payment');
    }
  };

  const savedNote =
    known.savedLast12Months >= 0
      ? `In the last 12 months you received ${formatMoney(known.savedLast12Months)} more than you spent (Personal page) — a rough guide to cash you may still hold.`
      : `In the last 12 months you spent ${formatMoney(-known.savedLast12Months)} more than you received (Personal page).`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back={{ to: '/goals', label: 'Goals' }}
        title="Zakat calculator"
        description="2.5% of what you own, minus what you owe now, once it reaches the nisab. Figures the app already knows are filled in; change anything."
      />

      <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
        <FormError message={error} />

        <section className="p-5 panel">
          <h2 className="font-medium">What you own</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Cash at home (Rs)" name="cash" type="number" min="0" step="1" value={form.cash} onChange={set('cash')} placeholder="0" />
            <Field label="Bank accounts (Rs)" name="bank" type="number" min="0" step="1" value={form.bank} onChange={set('bank')} placeholder="0" />
            <Field label="Money in savings goals (Rs)" name="goals" type="number" min="0" step="1" value={form.goals} onChange={set('goals')} placeholder="0" hint="From your Goals page" />
            <Field label="Money people owe you (Rs)" name="receivables" type="number" min="0" step="1" value={form.receivables} onChange={set('receivables')} placeholder="0" hint="From your group balances" />
            <Field label="Gold (tola)" name="goldTola" type="number" min="0" step="0.01" value={form.goldTola} onChange={set('goldTola')} placeholder="0" />
            <Field label="Silver (tola)" name="silverTola" type="number" min="0" step="0.01" value={form.silverTola} onChange={set('silverTola')} placeholder="0" />
            <Field label="Business stock (Rs)" name="business" type="number" min="0" step="1" value={form.business} onChange={set('business')} placeholder="0" />
            <Field label="Shares and investments (Rs)" name="investments" type="number" min="0" step="1" value={form.investments} onChange={set('investments')} placeholder="0" />
          </div>
          <p className="mt-3 flex gap-2 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {savedNote}
          </p>
        </section>

        <section className="p-5 panel">
          <h2 className="font-medium">What you owe now</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="You owe in groups (Rs)" name="groupDebts" type="number" min="0" step="1" value={form.groupDebts} onChange={set('groupDebts')} placeholder="0" hint="From your group balances" />
            <Field label="Other debts due now (Rs)" name="otherDebts" type="number" min="0" step="1" value={form.otherDebts} onChange={set('otherDebts')} placeholder="0" />
          </div>
        </section>

        <section className="p-5 panel">
          <h2 className="font-medium">Gold and silver prices</h2>
          <p className="mt-1 text-sm text-slate-500">
            {!rates && 'Prices could not be fetched right now — type today’s prices below.'}
            {rates?.source === 'admin' &&
              `Bazaar rate set by the admin on ${formatDate(rates.updatedAt)}: gold ${formatMoney(rates.goldPerTola)}, silver ${formatMoney(rates.silverPerTola)} per tola.`}
            {rates?.source === 'international' && (
              <>
                International rate, updated {formatDate(rates.updatedAt)}
                {rates.stale && ' (could not refresh, last saved copy)'}: gold {formatMoney(rates.goldPerTola)}, silver{' '}
                {formatMoney(rates.silverPerTola)} per tola. Bazaar rates are usually a little higher — type your own below if you like. Prices by{' '}
                <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                  {source.name}
                </a>
                .
              </>
            )}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Gold, Rs per tola" name="goldPerTola" type="number" min="1" step="1" value={form.goldPerTola} onChange={set('goldPerTola')} placeholder={rates ? String(rates.goldPerTola) : 'e.g. 250000'} hint={rates ? 'Leave empty to use the saved price' : ''} />
            <Field label="Silver, Rs per tola" name="silverPerTola" type="number" min="1" step="1" value={form.silverPerTola} onChange={set('silverPerTola')} placeholder={rates ? String(rates.silverPerTola) : 'e.g. 3000'} hint={rates ? 'Leave empty to use the saved price' : ''} />
          </div>

          <div className="mt-4">
            <span className="text-sm font-medium text-slate-700">Nisab by</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ['silver', 'Silver — 52.5 tola'],
                ['gold', 'Gold — 7.5 tola'],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setBasis(key);
                    setResult(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${basis === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Silver gives the lower nisab, which most people in Pakistan use.</p>
          </div>
        </section>

        <SubmitButton loading={working}>Calculate zakat</SubmitButton>
      </form>


      {result && (
        <section className={`mt-6 rounded-xl p-5 ring-1 ${result.due ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-slate-200'}`}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Everything you own</dt>
              <dd className="font-medium">{formatMoney(result.total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Minus what you owe now</dt>
              <dd className="font-medium">−{formatMoney(result.debts)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5">
              <dt className="text-slate-600">Your zakatable wealth</dt>
              <dd className="font-semibold">{formatMoney(result.net)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Nisab ({result.nisabBasis === 'gold' ? 'gold' : 'silver'})</dt>
              <dd className="font-medium">{formatMoney(result.nisab)}</dd>
            </div>
          </dl>
          {result.due ? (
            <>
              <p className="mt-4 text-sm text-emerald-800">Zakat due (2.5%)</p>
              <p className="text-3xl font-semibold text-emerald-700">{formatMoney(result.zakat)}</p>
              <button
                onClick={record}
                disabled={recorded}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {recorded ? 'Recorded in Personal' : 'Record as paid'}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-700">Your wealth is below the nisab, so no zakat is due this year.</p>
          )}
        </section>
      )}

      {/* Its own form: forms cannot nest. */}
      {canEditRates && <RatesEditor rates={rates} onSaved={onRatesSaved} />}

      <p className="mt-6 text-xs text-slate-500">This is an estimate — confirm with a scholar, as opinions differ on some assets.</p>
    </div>
  );
}
