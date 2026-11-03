import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** The top of every page: where you are, what it is for, and its main actions. */
export default function PageHeader({ title, description, actions, back }) {
  return (
    <header className="mb-7">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight text-ink sm:text-[32px]">{title}</h1>
          {description && <div className="mt-1 max-w-2xl text-[15px] text-slate-500">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
