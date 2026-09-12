import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirm, so a destructive action still reads like
 * `if (!(await confirm({...}))) return;` — but in our own dialog, not the
 * browser's blocking one.
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    setDialog({ title: 'Are you sure?', confirmLabel: 'Delete', tone: 'danger', ...options });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => e.key === 'Escape' && close(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex gap-3">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                  dialog.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900">{dialog.title}</h2>
                {dialog.description && <p className="mt-1 text-sm text-slate-500">{dialog.description}</p>}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  dialog.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
};
