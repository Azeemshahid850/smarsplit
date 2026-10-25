import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Full-size look at a receipt image that was scanned earlier. Esc or backdrop closes. */
export default function ReceiptPreview({ url, title = 'Receipt', onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4">
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <p className="truncate text-sm font-medium text-slate-800">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-auto bg-slate-100 p-3">
          <img src={url} alt={title} className="mx-auto max-h-[80vh] rounded-lg bg-white object-contain shadow" />
        </div>
      </div>
    </div>
  );
}
