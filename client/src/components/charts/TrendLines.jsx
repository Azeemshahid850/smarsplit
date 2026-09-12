import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SERIES, AXIS, GRID } from './palette.js';
import ChartTooltip from './ChartTooltip.jsx';

const compact = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Inflow vs outflow over N months. Both series are rupees — one axis, always. */
export default function TrendLines({ series, currency = 'PKR' }) {
  if (!series?.length) return <p className="py-10 text-center text-sm text-slate-400">No history yet.</p>;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} {...AXIS} />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="inflow" name="Received" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="outflow" name="Spent" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
