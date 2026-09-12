import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SERIES, AXIS, GRID } from './palette.js';
import ChartTooltip from './ChartTooltip.jsx';

const compact = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Two comparable measures side by side: budget vs actual, or paid vs consumed. */
export default function GroupedBars({ data, xKey, bars, currency = 'PKR', empty = 'Nothing to chart yet.' }) {
  if (!data?.length) return <p className="py-10 text-center text-sm text-slate-400">{empty}</p>;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} {...AXIS} />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {bars.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={34} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
