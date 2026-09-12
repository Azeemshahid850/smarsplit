import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { categoryColor } from './palette.js';
import ChartTooltip from './ChartTooltip.jsx';
import { formatMoney } from '../../utils/format.js';

/**
 * Composition of one month's spending. Three palette slots sit under 3:1 on a
 * light surface, so the legend doubles as a labelled value table — identity and
 * magnitude stay readable without relying on colour alone.
 */
export default function CategoryDonut({ categories, currency = 'PKR' }) {
  const data = categories.filter((categoryRow) => categoryRow.total > 0);
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">Nothing spent this month.</p>;

  const total = data.reduce((runningTotal, categoryRow) => runningTotal + categoryRow.total, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="category" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
              {data.map((categoryRow) => (
                <Cell key={categoryRow.category} fill={categoryColor(categoryRow.category)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-semibold text-slate-900">{formatMoney(total, currency)}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {data.map((categoryRow) => (
            <tr key={categoryRow.category}>
              <td className="py-1">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(categoryRow.category) }} />
                  <span className="text-slate-700">{categoryRow.category}</span>
                </span>
              </td>
              <td className="py-1 text-right text-slate-500">{categoryRow.share ?? Math.round((categoryRow.total / total) * 100)}%</td>
              <td className="py-1 text-right font-medium text-slate-800">{formatMoney(categoryRow.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
