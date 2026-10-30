import { useState } from 'react';
import { toast } from 'sonner';
import { Target, Plus, Pencil, Trash2, X, PartyPopper } from 'lucide-react';
import { listGoals, createGoal, updateGoal, deleteGoal, addContribution, removeContribution } from '../api/goals.js';
import { useAsync } from '../hooks/useAsync.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';
import { formatMoney, formatDate } from '../utils/format.js';

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function GoalForm({ initial, onSave, onCancel, submitLabel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    targetAmount: initial ? String(initial.targetAmount) : '',
    targetDate: initial?.targetDate ? initial.targetDate.slice(0, 10) : '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const targetAmount = Math.round(Number(form.targetAmount));
    if (form.title.trim().length < 2) return setError('Give the goal a name');
    if (!(targetAmount > 0)) return setError('Enter a target above zero');

    setError('');
    setSaving(true);
    try {
      await onSave({ title: form.title.trim(), targetAmount, targetDate: form.targetDate || null });
    } catch (err) {
      setError(err.message || 'Could not save the goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <FormError message={error} />
      <Field label="What are you saving for?" name="title" value={form.title} onChange={set('title')} placeholder="New laptop" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Target (Rs)" name="targetAmount" type="number" min="1" step="1" value={form.targetAmount} onChange={set('targetAmount')} placeholder="80000" />
        <Field label="By (optional)" name="targetDate" type="date" min={tomorrow()} value={form.targetDate} onChange={set('targetDate')} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <SubmitButton loading={saving}>{submitLabel}</SubmitButton>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function GoalCard({ goal, onChanged, onRemoved }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const move = async (sign) => {
    const rupees = Math.round(Number(amount));
    if (!(rupees > 0)) return toast.error('Enter an amount above zero');
    setBusy(true);
    try {
      const { goal: updated } = await addContribution(goal.id, { amount: sign * rupees, note: note.trim() });
      onChanged(updated);
      setAmount('');
      setNote('');
      if (updated.achieved && !goal.achieved) toast.success(`Goal reached: ${goal.title}!`);
      else toast.success(sign > 0 ? `Added ${formatMoney(rupees)} to ${goal.title}` : `Took ${formatMoney(rupees)} out of ${goal.title}`);
    } catch (err) {
      toast.error(err.message || 'Could not update the goal');
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (entry) => {
    try {
      const { goal: updated } = await removeContribution(goal.id, entry.id);
      onChanged(updated);
    } catch (err) {
      toast.error(err.message || 'Could not remove that entry');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${goal.title}"?`,
      description: `Its history of ${goal.contributions.length} ${goal.contributions.length === 1 ? 'entry' : 'entries'} goes with it. Your transactions are not affected.`,
    });
    if (!ok) return;
    try {
      await deleteGoal(goal.id);
      onRemoved(goal.id);
      toast.success(`Deleted "${goal.title}"`);
    } catch (err) {
      toast.error(err.message || 'Could not delete the goal');
    }
  };

  const barTone = goal.achieved ? 'bg-emerald-500' : goal.onTrack === false ? 'bg-amber-500' : 'bg-emerald-500';
  const entries = showAll ? goal.contributions : goal.contributions.slice(0, 3);

  if (editing) {
    return (
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <GoalForm
          initial={goal}
          submitLabel="Save goal"
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            const { goal: updated } = await updateGoal(goal.id, body);
            onChanged(updated);
            setEditing(false);
            toast.success('Goal updated');
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-900">{goal.title}</h3>
          <p className="text-xs text-slate-400">
            {goal.targetDate ? `By ${formatDate(goal.targetDate)}` : 'No deadline'} · started {formatDate(goal.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {goal.achieved && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Reached</span>}
          {!goal.achieved && goal.onTrack === true && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">On track</span>}
          {!goal.achieved && goal.onTrack === false && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Behind</span>}
          <button onClick={() => setEditing(true)} title="Edit goal" className="text-slate-300 hover:text-slate-700">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={remove} title="Delete goal" className="text-slate-300 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span>
          <span className="text-lg font-semibold text-slate-900">{formatMoney(goal.saved)}</span>
          <span className="text-slate-400"> of {formatMoney(goal.targetAmount)}</span>
        </span>
        <span className="font-medium text-slate-600">{goal.percent}%</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={goal.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${goal.percent}%` }} />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {goal.achieved ? (
          <span className="flex items-center gap-1 text-emerald-700">
            <PartyPopper className="h-3.5 w-3.5" /> Reached on {formatDate(goal.reachedAt)}
          </span>
        ) : goal.monthlyNeeded == null ? (
          `${formatMoney(goal.remaining)} to go`
        ) : goal.daysLeft > 0 ? (
          `${formatMoney(goal.remaining)} to go · ${goal.daysLeft} days left · save about ${formatMoney(goal.monthlyNeeded)} a month`
        ) : (
          `The date has passed — ${formatMoney(goal.remaining)} still to go`
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount (Rs)"
          aria-label={`Amount for ${goal.title}`}
          className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note (optional)"
          maxLength={120}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button disabled={busy} onClick={() => move(1)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          Add
        </button>
        <button
          disabled={busy || goal.saved === 0}
          onClick={() => move(-1)}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
        >
          Withdraw
        </button>
      </div>

      {goal.contributions.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 py-2">
              <span className="w-24 text-xs text-slate-400">{formatDate(entry.date)}</span>
              <span className="flex-1 truncate text-slate-600">{entry.note || (entry.amount > 0 ? 'Deposit' : 'Withdrawal')}</span>
              <span className={entry.amount > 0 ? 'text-emerald-700' : 'text-red-600'}>
                {entry.amount > 0 ? '+' : '−'}
                {formatMoney(Math.abs(entry.amount))}
              </span>
              <button onClick={() => removeEntry(entry)} title="Remove entry" className="text-slate-300 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {goal.contributions.length > 3 && (
            <li className="pt-2">
              <button onClick={() => setShowAll((value) => !value)} className="text-xs font-medium text-emerald-700 hover:underline">
                {showAll ? 'Show less' : `Show all ${goal.contributions.length} entries`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function Goals() {
  const goals = useAsync(() => listGoals(), []);
  const [creating, setCreating] = useState(false);

  const replace = (updated) =>
    goals.setData({ goals: goals.data.goals.map((goalRow) => (goalRow.id === updated.id ? updated : goalRow)) });
  const drop = (id) => goals.setData({ goals: goals.data.goals.filter((goalRow) => goalRow.id !== id) });

  const totals = (goals.data?.goals ?? []).reduce(
    (sum, goalRow) => ({ saved: sum.saved + goalRow.saved, target: sum.target + goalRow.targetAmount }),
    { saved: 0, target: 0 },
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Target className="h-6 w-6 text-emerald-600" /> Savings goals
          </h1>
          <p className="text-sm text-slate-500">Put money aside for something specific and see if you are on pace.</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New goal
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">New goal</h2>
          <GoalForm
            submitLabel="Create goal"
            onCancel={() => setCreating(false)}
            onSave={async (body) => {
              const { goal } = await createGoal(body);
              goals.setData({ goals: [goal, ...(goals.data?.goals ?? [])] });
              setCreating(false);
              toast.success(`Goal created: ${goal.title}`);
            }}
          />
        </div>
      )}

      <div className="mt-6">
        {goals.loading && <Loading />}
        {goals.error && <ErrorState message={goals.error} onRetry={goals.reload} />}
        {goals.data && goals.data.goals.length === 0 && !creating && (
          <EmptyState
            title="No goals yet"
            hint="A laptop, Eid shopping, a trip to Hunza — give it a target and a date."
            action={
              <button onClick={() => setCreating(true)} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                Create your first goal
              </button>
            }
          />
        )}
        {goals.data && goals.data.goals.length > 0 && (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {formatMoney(totals.saved)} saved across {goals.data.goals.length} {goals.data.goals.length === 1 ? 'goal' : 'goals'} · target{' '}
              {formatMoney(totals.target)}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {goals.data.goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onChanged={replace} onRemoved={drop} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
