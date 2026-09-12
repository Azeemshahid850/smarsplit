import { useState } from 'react';
import { FileSpreadsheet, FileText, Table2, TrendingDown, Users } from 'lucide-react';
import { monthlyReport, trendsReport, groupReport, downloadExport } from '../api/reports.js';
import { listGroups } from '../api/groups.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatSigned } from '../utils/format.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import StatCard from '../components/StatCard.jsx';
import CategoryDonut from '../components/charts/CategoryDonut.jsx';
import TrendLines from '../components/charts/TrendLines.jsx';
import GroupedBars from '../components/charts/GroupedBars.jsx';

const thisMonth = () => new Date().toISOString().slice(0, 7);

function ExportButtons({ params }) {
  const [busy, setBusy] = useState('');

  const run = async (format) => {
    setBusy(format);
    try {
      await downloadExport({ ...params, format });
    } finally {
      setBusy('');
    }
  };

  const buttons = [
    { format: 'csv', label: 'CSV', icon: Table2 },
    { format: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
    { format: 'pdf', label: 'PDF', icon: FileText },
  ];

  return (
    <div className="flex gap-2">
      {buttons.map(({ format, label, icon: Icon }) => (
        <button
          key={format}
          onClick={() => run(format)}
          disabled={Boolean(busy)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
        >
          <Icon className="h-4 w-4 text-slate-400" />
          {busy === format ? '…' : label}
        </button>
      ))}
    </div>
  );
}

function PersonalReport({ month, setMonth }) {
  const monthly = useAsync(() => monthlyReport(month), [month]);
  const trends = useAsync(() => trendsReport(6), []);

  if (monthly.loading) return <Loading />;
  if (monthly.error) return <ErrorState message={monthly.error} onRetry={monthly.reload} />;

  const r = monthly.data.report;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <ExportButtons params={{ scope: 'transactions', month }} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Received" value={formatMoney(r.income)} tone="emerald" />
        <StatCard
          label="Spent"
          value={formatMoney(r.spend)}
          tone="red"
          icon={TrendingDown}
          hint={r.vsLastMonth.spendPercent != null ? `${r.vsLastMonth.spendPercent > 0 ? '+' : ''}${r.vsLastMonth.spendPercent}% vs last month` : undefined}
        />
        <StatCard label="Net" value={formatSigned(r.net)} />
        <StatCard label="Savings rate" value={`${r.savingsRate}%`} tone={r.savingsRate >= 0 ? 'emerald' : 'red'} />
      </div>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Category distribution</h2>
        <p className="text-xs text-slate-400">Where {r.month} went</p>
        <div className="mt-4">
          <CategoryDonut categories={r.topCategories} />
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Inflow vs outflow</h2>
        <p className="text-xs text-slate-400">Last six months</p>
        <div className="mt-4">
          {trends.loading && <Loading />}
          {trends.error && <ErrorState message={trends.error} onRetry={trends.reload} />}
          {trends.data && <TrendLines series={trends.data.report.series} />}
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Budget vs actual</h2>
        <p className="text-xs text-slate-400">This month, for the categories you capped</p>
        <div className="mt-4">
          {trends.data && (
            <GroupedBars
              data={trends.data.report.budgetVsActual}
              xKey="category"
              bars={[
                { key: 'cap', label: 'Budget' },
                { key: 'actual', label: 'Actual' },
              ]}
              empty="Set a budget on the Personal page to see this chart."
            />
          )}
        </div>
      </section>

      {r.biggestExpense && (
        <p className="mt-4 text-sm text-slate-500">
          Biggest expense this month: <span className="font-medium text-slate-800">{r.biggestExpense.title}</span> —{' '}
          {formatMoney(r.biggestExpense.amount)} ({r.biggestExpense.category})
        </p>
      )}
    </>
  );
}

function GroupReport({ groups }) {
  const [groupId, setGroupId] = useState(groups[0]?.id || '');
  const report = useAsync(() => (groupId ? groupReport(groupId) : Promise.resolve(null)), [groupId]);

  if (!groups.length) {
    return <EmptyState title="No groups yet" hint="Group reports appear once you have a trip with expenses." />;
  }
  if (report.loading) return <Loading />;
  if (report.error) return <ErrorState message={report.error} onRetry={report.reload} />;

  const r = report.data.report;
  const eff = r.settlementEfficiency;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {groups.map((groupRow) => (
            <option key={groupRow.id} value={groupRow.id}>
              {groupRow.title}
            </option>
          ))}
        </select>
        <ExportButtons params={{ scope: 'group', groupId }} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Total spent" value={formatMoney(r.total, r.baseCurrency)} />
        <StatCard label="Per person" value={formatMoney(r.perPerson, r.baseCurrency)} icon={Users} />
        <StatCard label="Payments" value={eff.optimizedCount ? `${eff.rawDebtCount} → ${eff.optimizedCount}` : '—'} />
        <StatCard label="Transfers saved" value={String(eff.transfersSaved)} tone="emerald" />
      </div>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Paid vs consumed</h2>
        <p className="text-xs text-slate-400">How fairly the spending landed</p>
        <div className="mt-4">
          <GroupedBars
            data={r.members.map((memberRow) => ({ name: memberRow.name.split(' ')[0], paid: memberRow.paid, consumed: memberRow.consumed }))}
            xKey="name"
            bars={[
              { key: 'paid', label: 'Paid' },
              { key: 'consumed', label: 'Consumed' },
            ]}
            currency={r.baseCurrency}
            empty="No expenses in this group yet."
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Category split</h2>
        <div className="mt-4">
          <CategoryDonut categories={r.byCategory} currency={r.baseCurrency} />
        </div>
      </section>
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('Personal');
  const [month, setMonth] = useState(thisMonth());
  const groups = useAsync(listGroups);

  return (
    <>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-slate-500">Charts, trends and exports for both workspaces.</p>

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        {['Personal', 'Group'].map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              tab === tabName ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tabName}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'Personal' && <PersonalReport month={month} setMonth={setMonth} />}
        {tab === 'Group' && (groups.loading ? <Loading /> : <GroupReport groups={groups.data?.groups ?? []} />)}
      </div>
    </>
  );
}
