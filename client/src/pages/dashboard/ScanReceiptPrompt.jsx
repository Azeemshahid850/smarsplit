import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { btn } from '../../components/ui/buttonStyles.js';

/** A short pointer to the receipt scanner, the ExpenseAI half of the app. */
export default function ScanReceiptPrompt() {
  return (
    <section className="panel flex flex-col p-5 sm:p-6">
      <ScanLine className="h-6 w-6 text-slate-500" strokeWidth={1.75} />
      <h2 className="mt-3 text-xl font-semibold">Scan a receipt</h2>
      <p className="mt-1 flex-1 text-sm text-slate-600">
        ExpenseAI reads every item, you check them, and it shows where the same things cost less.
      </p>
      <Link to="/scan" className={`${btn.secondary} mt-4 self-start`}>
        Scan receipt
      </Link>
    </section>
  );
}
