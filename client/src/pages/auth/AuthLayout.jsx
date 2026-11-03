import { Link } from 'react-router-dom';
import BrandMark from '../../components/layout/BrandMark.jsx';

// The Murree trip from the viva guide: what Settle up turns nine repayments into.
const sampleSettlement = [
  { from: 'Bilal', to: 'Azeem', amount: 'Rs 2,500' },
  { from: 'Saba', to: 'Azeem', amount: 'Rs 900' },
  { from: 'Chanda', to: 'Azeem', amount: 'Rs 100' },
];

/** Sign-in pages: the form on paper, and on wide screens a page from the khata beside it. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Link to="/">
          <BrandMark tone="light" />
        </Link>

        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">Track what you spend. Settle what you owe.</h2>
          <p className="mt-4 text-white/70">
            One account for your own money and for the trips, flats and events you share with others.
          </p>

          <figure className="mt-10 rounded-lg border-l-[3px] border-haldi bg-white/[0.06] p-5">
            <figcaption className="flex items-baseline justify-between text-sm text-white/70">
              <span>Murree Trip, settled</span>
              <span>4 friends</span>
            </figcaption>
            <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
              {sampleSettlement.map((payment) => (
                <li key={payment.from} className="flex items-baseline justify-between py-2.5 text-sm">
                  <span>
                    {payment.from} pays {payment.to}
                  </span>
                  <span className="amount">{payment.amount}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t-[3px] border-double border-white/40 pt-3 text-sm text-white/80">
              3 payments instead of 9, worked out by Min-Cash-Flow.
            </p>
          </figure>
        </div>

        <p className="text-xs text-white/40">Final Year Project, NCBA&amp;E</p>
      </aside>

      <main className="flex min-h-screen flex-col justify-center p-6 sm:p-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <BrandMark />
          </Link>
          <h1 className="text-3xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
