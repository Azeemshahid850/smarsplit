import { useState } from 'react';
import { Trash2, Plus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '../context/CategoriesContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

export default function CategorySettings() {
  const { defaults, custom, add, remove, usage } = useCategories();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    const value = name.trim();
    if (value.length < 2) return;

    setBusy(true);
    try {
      await add(value);
      setName('');
      toast.success(`"${value}" added — it is now in every category picker`);
    } catch (err) {
      toast.error(err.message || 'Could not add that category');
    } finally {
      setBusy(false);
    }
  };

  const destroy = async (category) => {
    // Show what still points at it before asking — deleting keeps the history.
    let used = { total: 0 };
    try {
      ({ usage: used } = await usage(category.id));
    } catch {
      /* fall through to the plain confirmation */
    }

    const where = [
      used.transactions && `${used.transactions} transaction${used.transactions > 1 ? 's' : ''}`,
      used.expenses && `${used.expenses} group expense${used.expenses > 1 ? 's' : ''}`,
      used.budgets && `${used.budgets} budget`,
    ]
      .filter(Boolean)
      .join(', ');

    const ok = await confirm({
      title: `Delete the "${category.name}" category?`,
      description: used.total
        ? `It is still used by ${where}. Those keep the name and stay in your reports — you just cannot pick it for anything new.`
        : 'Nothing uses it yet, so nothing else changes.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await remove(category.id);
      toast.success(`"${category.name}" removed from the pickers`);
    } catch (err) {
      toast.error(err.message || 'Could not delete that category');
    }
  };

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h3 className="font-medium">Categories</h3>
      <p className="text-xs text-slate-400">The seven built-in ones, plus any you add yourself.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {defaults.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            <Lock className="h-3 w-3 text-slate-400" />
            {c}
          </span>
        ))}
        {custom.map((c) => (
          <span key={c.id} className="flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-2.5 pr-1.5 text-xs text-emerald-800">
            {c.name}
            <button onClick={() => destroy(c)} title={`Delete ${c.name}`} className="text-emerald-400 hover:text-red-600">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={create} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Education, Pets, Eid…"
          maxLength={30}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          disabled={busy || name.trim().length < 2}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>
    </div>
  );
}
