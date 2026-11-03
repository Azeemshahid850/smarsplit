import { Link } from 'react-router-dom';
import { formatMoney } from '../../utils/format.js';
import { Loading, ErrorState } from '../../components/ui/States.jsx';

const monthName = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

const Line = ({ label, value, tone = 'text-ink' }) => (
  <div className="flex items-baseline justify-between gap-3 py-2.5">
    <dt className="text-sm text-slate-600">{label}</dt>
    <dd className={`amount text-lg ${tone}`}>{value}</dd>
  </div>
);

/** This month's personal money: what went out, what came in, what ExpenseAI saved. */
export default function ThisMonth({ summary }) {
  const data = summary.data;
  const change = data ? data.spend - data.lastMonthSpend : 0;

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{data ? monthName(data.month) : 'This month'}</h2>
        <Link to="/personal" className="text-sm font-medium text-slate-600 hover:text-ink">
          Personal
        </Link>
      </div>

      <div className="mt-4">
        {summary.loading && <Loading />}
        {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
        {data && (
          <>
            <dl className="divide-y divide-rule border-t border-rule">
              <Line label="Spent" value={formatMoney(data.spend)} />
              <Line label="Received" value={formatMoney(data.income)} tone="text-gain" />
              <Line label="Saved with ExpenseAI" value={formatMoney(data.savingsFound)} tone="text-gain" />
            </dl>
            {data.lastMonthSpend > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {change === 0
                  ? 'The same as last month so far.'
                  : `${formatMoney(Math.abs(change))} ${change < 0 ? 'less' : 'more'} than all of last month.`}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
