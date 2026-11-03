import { Link } from 'react-router-dom';
import { Wallet, PieChart, Users, Sparkles } from 'lucide-react';

const points = [
  { icon: Users, text: 'Split trip costs with any method — equal, exact, percentage or line items' },
  { icon: PieChart, text: 'Min-Cash-Flow settlement cuts the number of payments to the minimum' },
  { icon: Sparkles, text: 'Scan a receipt, verify the lines, get cheaper alternatives' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="hidden bg-slate-900 p-12 text-slate-100 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-6 w-6 text-emerald-400" />
          SmartSplit <span className="font-normal text-slate-400">&amp; ExpenseAI</span>
        </Link>

        <div>
          <h2 className="text-3xl font-semibold leading-snug">
            Track what you spend.
            <br />
            Settle what you owe.
          </h2>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm text-slate-300">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">Final Year Project · NCBA&amp;E</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
