import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Check, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { getGroup } from '../api/groups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getBalances } from '../api/expenses.js';
import { previewSettlement, recordSettlement, listSettlements, markPaid } from '../api/settlements.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import FormError from '../components/FormError.jsx';
import Avatar from '../components/Avatar.jsx';

function PaymentCard({ payment, currency, onPay, faded }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl bg-white p-4 ring-1 transition-all duration-500 ${
        faded ? 'scale-95 opacity-30 ring-slate-200' : 'ring-slate-200'
      } ${payment.isPaid ? 'bg-emerald-50/50' : ''}`}
    >
      <Avatar name={payment.fromName} />
      <span className="text-sm font-medium text-slate-700">{payment.fromName}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
      <Avatar name={payment.toName} />
      <span className="text-sm font-medium text-slate-700">{payment.toName}</span>

      <span className="ml-auto font-semibold text-slate-900">{formatMoney(payment.amount, currency)}</span>

      {onPay &&
        (payment.isPaid ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
            <Check className="h-3 w-3" /> paid
          </span>
        ) : (
          <button onClick={() => onPay(payment)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
            Mark paid
          </button>
        ))}
    </li>
  );
}

export default function SettleUp() {
  const { id } = useParams();
  const { user } = useAuth();
  const group = useAsync(() => getGroup(id), [id]);
  const balances = useAsync(() => getBalances(id), [id]);
  const recorded = useAsync(() => listSettlements(id), [id]);

  const [preview, setPreview] = useState(null);
  const [simplifying, setSimplifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (group.loading || balances.loading || recorded.loading) return <Loading label="Loading settlement…" />;
  if (group.error) return <ErrorState message={group.error} onRetry={group.reload} />;

  const g = group.data.group;
  const iAmAdmin = g.members.some((memberRow) => memberRow.userId === user.id && memberRow.role === 'admin');
  const currency = g.baseCurrency;
  const settled = recorded.data.settlements;
  const hasRecorded = settled.length > 0;

  const simplify = async () => {
    setError('');
    setSimplifying(true);
    try {
      setPreview(await previewSettlement(id));
    } catch (err) {
      setError(err.message || 'Could not compute the settlement');
    } finally {
      setSimplifying(false);
    }
  };

  const confirm = async () => {
    setError('');
    setSaving(true);
    try {
      const result = await recordSettlement(id);
      setPreview(null);
      await Promise.all([recorded.reload(), balances.reload(), group.reload()]);
      toast.success(`Settlement recorded — ${result.optimizedCount} payments, ${result.transfersSaved} transfers saved`);
    } catch (err) {
      setError(err.message || 'Could not record the settlement');
    } finally {
      setSaving(false);
    }
  };

  const pay = async (payment) => {
    setError('');
    try {
      await markPaid(payment.id, true);
      await Promise.all([recorded.reload(), balances.reload()]);
      toast.success(`${payment.fromName} → ${payment.toName} marked paid`);
    } catch (err) {
      setError(err.message || 'Could not mark that payment paid');
    }
  };

  const nothingOwed = balances.data.balances.every((balanceRow) => balanceRow.net === 0);

  return (
    <>
      <Link to={`/groups/${id}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {g.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Settle up</h1>
      <p className="text-sm text-slate-500">Min-Cash-Flow finds the fewest payments that clear every debt.</p>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      {hasRecorded && (
        <section className="mt-4 rounded-xl bg-slate-900 p-5 text-slate-100">
          <p className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-emerald-400" /> Settlement recorded
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {settled.filter((settlementRow) => settlementRow.isPaid).length} of {settled.length} payments marked paid.
          </p>
          <ul className="mt-4 space-y-2">
            {settled.map((settlementRow) => (
              <PaymentCard key={settlementRow.id} payment={settlementRow} currency={currency} onPay={pay} />
            ))}
          </ul>

          {recorded.data.auditTrail.length > 0 && (
            <div className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300">Audit trail</p>
              <ul className="mt-1 space-y-0.5">
                {recorded.data.auditTrail.map((entry, index) => (
                  <li key={index}>
                    {entry.action.replace(/_/g, ' ').toLowerCase()} · {formatDate(entry.at)}
                    {entry.detail?.transfersSaved != null && ` · ${entry.detail.transfersSaved} transfers saved`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {!hasRecorded && nothingOwed && (
        <EmptyState title="Everyone is settled up" hint="No debts to simplify in this group right now." />
      )}

      {!hasRecorded && !nothingOwed && (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* Raw debts */}
          <section>
            <h2 className="text-sm font-medium text-slate-700">Who owes whom right now</h2>
            <p className="text-xs text-slate-400">Straight from the expenses, before optimisation.</p>

            <ul className="mt-3 space-y-2">
              {(preview?.rawDebts ?? []).length === 0 && !preview && (
                <li className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-400">
                  Run the optimiser to see the raw debts alongside the result.
                </li>
              )}
              {preview?.rawDebts.map((debtRow, index) => (
                <PaymentCard key={index} payment={debtRow} currency={currency} faded />
              ))}
            </ul>
          </section>

          {/* Optimized */}
          <section>
            <h2 className="text-sm font-medium text-slate-700">Optimized payments</h2>
            <p className="text-xs text-slate-400">At most {g.memberCount - 1} payments for {g.memberCount} members.</p>

            {!preview && (
              <button
                onClick={simplify}
                disabled={simplifying}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {simplifying ? 'Computing…' : 'Simplify with Min-Cash-Flow'}
              </button>
            )}

            {preview && (
              <>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
                  <TrendingDown className="h-5 w-5" />
                  <p className="text-sm">
                    <span className="text-lg font-semibold">
                      {preview.rawDebtCount} → {preview.optimizedCount}
                    </span>{' '}
                    payments · {preview.transfersSaved} transfers saved
                  </p>
                </div>

                <ul className="mt-3 space-y-2">
                  {preview.payments.map((paymentRow, index) => (
                    <PaymentCard key={index} payment={paymentRow} currency={currency} />
                  ))}
                </ul>

                {iAmAdmin ? (
                  <>
                    <button
                      onClick={confirm}
                      disabled={saving}
                      className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {saving ? 'Recording…' : 'Record settlement'}
                    </button>
                    <p className="mt-2 text-center text-xs text-slate-400">
                      This writes the payments and closes the group. Balances update as each one is marked paid.
                    </p>
                  </>
                ) : (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
                    Only a group admin can record the settlement and close the group. Ask them when everyone agrees.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
