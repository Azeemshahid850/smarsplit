import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { listGroups, getGroup } from '../api/groups.js';
import { createExpense, getExpense, updateExpense } from '../api/expenses.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCategories } from '../context/CategoriesContext.jsx';
import { formatMoney } from '../utils/format.js';
import Field from '../components/Field.jsx';
import SubmitButton from '../components/SubmitButton.jsx';
import FormError from '../components/FormError.jsx';
import { Loading } from '../components/States.jsx';

const SPLIT_TYPES = [
  { key: 'EQUAL', label: 'Equally' },
  { key: 'EXACT', label: 'Exact amounts' },
  { key: 'PERCENTAGE', label: 'Percentage' },
  { key: 'LINE_ITEM', label: 'Line items' },
];

const int = (fieldValue) => (fieldValue === '' || fieldValue == null ? 0 : Math.round(Number(fieldValue)) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function AddExpense() {
  const { expenseId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { user } = useAuth();
  const { all: CATEGORIES } = useCategories();
  const editing = Boolean(expenseId);
  const receiptDraft = state?.draft; // handed over by the receipt scan flow

  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(params.get('group') || '');
  const [group, setGroup] = useState(null);
  const [booting, setBooting] = useState(true);

  const [form, setForm] = useState({ title: '', totalAmount: '', date: today(), category: 'Misc', notes: '' });
  const [payers, setPayers] = useState([]);
  const [splitType, setSplitType] = useState('EQUAL');
  const [participants, setParticipants] = useState([]);
  const [exact, setExact] = useState({});
  const [percentages, setPercentages] = useState({});
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the group list (create mode) or the expense being edited.
  useEffect(() => {
    (async () => {
      try {
        if (editing) {
          const { expense, groupId: gid } = await getExpense(expenseId);
          setGroupId(gid);
          setForm({
            title: expense.title,
            totalAmount: String(expense.totalAmount),
            date: expense.date.slice(0, 10),
            category: expense.category,
            notes: expense.notes || '',
          });
          setPayers(expense.paidBy.map((payerEntry) => ({ userId: payerEntry.userId, amount: String(payerEntry.amount) })));
          setSplitType(expense.splitType);
          setParticipants(expense.splits.map((splitOption) => splitOption.userId));
          setExact(Object.fromEntries(expense.splits.map((splitOption) => [splitOption.userId, String(splitOption.share)])));
          setItems(expense.items.map((rowIndex) => ({ ...rowIndex, price: String(rowIndex.price), qty: String(rowIndex.qty) })));
        } else {
          const { groups: list } = await listGroups();
          setGroups(list);
          if (!params.get('group') && list.length) setGroupId(list[0].id);

          // A verified receipt arrives as a ready-made LINE_ITEM expense.
          if (receiptDraft) {
            setGroupId(receiptDraft.groupId);
            setForm({
              title: receiptDraft.title,
              totalAmount: String(receiptDraft.totalAmount),
              date: String(receiptDraft.date).slice(0, 10),
              category: receiptDraft.category,
              notes: '',
            });
            setSplitType('LINE_ITEM');
            setItems(receiptDraft.items.map((rowIndex) => ({ ...rowIndex, price: String(rowIndex.price), qty: String(rowIndex.qty) })));
          }
        }
      } catch (err) {
        setError(err.message || 'Could not load this page');
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  // Whenever the group changes, load its members and seed sensible defaults.
  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId)
      .then(({ group: groupRow }) => {
        setGroup(groupRow);
        const active = groupRow.members.filter((memberRow) => memberRow.status === 'active' && memberRow.userId);
        setParticipants((prev) => (prev.length ? prev : active.map((memberRow) => memberRow.userId)));
        setPayers((prev) => (prev.length ? prev : [{ userId: user.id, amount: '' }]));
      })
      .catch((err) => setError(err.message || 'Could not load that group'));
  }, [groupId, user.id]);

  const members = useMemo(() => (group?.members || []).filter((memberRow) => memberRow.status === 'active' && memberRow.userId), [group]);
  const nameOf = (userId) => members.find((memberRow) => memberRow.userId === userId)?.name || '—';

  const total = int(form.totalAmount);
  const covered = payers.reduce((runningTotal, payerEntry) => runningTotal + int(payerEntry.amount), 0);
  const currency = group?.baseCurrency || 'PKR';

  // Live mirror of the server invariants — the button stays off until they hold.
  const problem = useMemo(() => {
    if (!groupId) return 'Pick a group';
    if (form.title.trim().length < 2) return 'Give the expense a title';
    if (total <= 0) return 'Enter an amount above zero';
    if (covered !== total) {
      const diff = total - covered;
      return diff > 0 ? `You're ${formatMoney(diff, currency)} short` : `You're ${formatMoney(-diff, currency)} over`;
    }
    if (splitType === 'EQUAL' && participants.length === 0) return 'Pick at least one person';
    if (splitType === 'EXACT') {
      const given = participants.reduce((runningTotal, id) => runningTotal + int(exact[id]), 0);
      if (given !== total) {
        const diff = total - given;
        return diff > 0 ? `Shares are ${formatMoney(diff, currency)} short` : `Shares are ${formatMoney(-diff, currency)} over`;
      }
    }
    if (splitType === 'PERCENTAGE') {
      const pct = Math.round(participants.reduce((runningTotal, id) => runningTotal + Number(percentages[id] || 0), 0) * 100) / 100;
      if (pct !== 100) return `Percentages add up to ${pct}%, not 100%`;
    }
    if (splitType === 'LINE_ITEM') {
      if (!items.length) return 'Add at least one line item';
      if (items.some((rowIndex) => !rowIndex.sharedBy?.length)) return 'Every item needs at least one person';
      const lines = items.reduce((runningTotal, rowIndex) => runningTotal + Math.round(int(rowIndex.price) * (Number(rowIndex.qty) || 1)), 0);
      if (lines !== total) return `Line items add up to ${formatMoney(lines, currency)}, not ${formatMoney(total, currency)}`;
    }
    return '';
  }, [groupId, form.title, total, covered, splitType, participants, exact, percentages, items, currency]);

  const perHead = participants.length ? Math.floor(total / participants.length) : 0;

  const toggleParticipant = (userId) =>
    setParticipants((list) => (list.includes(userId) ? list.filter((entry) => entry !== userId) : [...list, userId]));

  const submit = async (event) => {
    event.preventDefault();
    if (problem) return;
    setError('');
    setSaving(true);

    const body = {
      title: form.title.trim(),
      totalAmount: total,
      category: form.category,
      date: form.date,
      notes: form.notes,
      splitType,
      paidBy: payers.map((payerEntry) => ({ userId: payerEntry.userId, amount: int(payerEntry.amount) })),
      participants: splitType === 'EQUAL' ? participants : [],
      exact: splitType === 'EXACT' ? participants.map((id) => ({ userId: id, share: int(exact[id]) })) : [],
      percentages:
        splitType === 'PERCENTAGE' ? participants.map((id) => ({ userId: id, percent: Number(percentages[id] || 0) })) : [],
      items:
        splitType === 'LINE_ITEM'
          ? items.map((rowIndex) => ({ name: rowIndex.name, qty: Number(rowIndex.qty) || 1, price: int(rowIndex.price), sharedBy: rowIndex.sharedBy }))
          : [],
    };

    try {
      if (editing) await updateExpense(expenseId, body);
      else await createExpense(groupId, body);
      toast.success(editing ? `"${body.title}" updated` : `"${body.title}" added — ${formatMoney(total, currency)}`);
      navigate(`/groups/${groupId}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not save the expense');
    } finally {
      setSaving(false);
    }
  };

  if (booting) return <Loading />;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={groupId ? `/groups/${groupId}` : '/groups'} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{editing ? 'Edit expense' : 'Add expense'}</h1>

      <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
        <FormError message={error} />

        {!editing && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Group</span>
            <select
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                setParticipants([]);
                setPayers([]);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a group</option>
              {groups.map((groupRow) => (
                <option key={groupRow.id} value={groupRow.id}>
                  {groupRow.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <Field label="Title" name="title" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Hotel in Murree" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`Amount (${currency})`}
            name="totalAmount"
            type="number"
            min="1"
            step="1"
            required
            value={form.totalAmount}
            onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
          />
          <Field label="Date" name="date" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {CATEGORIES.map((categoryName) => (
                <option key={categoryName}>{categoryName}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Multi-payer */}
        <section className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Paid by</span>
            <span className={`text-xs ${covered === total && total > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              covered {formatMoney(covered, currency)} of {formatMoney(total, currency)}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {payers.map((payerEntry, index) => (
              <div key={index} className="flex gap-2">
                <select
                  value={payerEntry.userId}
                  onChange={(event) => setPayers((list) => list.map((entry, rowIndex) => (rowIndex === index ? { ...entry, userId: event.target.value } : entry)))}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {members.map((memberRow) => (
                    <option key={memberRow.userId} value={memberRow.userId}>
                      {memberRow.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={payerEntry.amount}
                  placeholder="0"
                  onChange={(event) => setPayers((list) => list.map((entry, rowIndex) => (rowIndex === index ? { ...entry, amount: event.target.value } : entry)))}
                  className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {payers.length > 1 && (
                  <button type="button" onClick={() => setPayers((list) => list.filter((_, rowIndex) => rowIndex !== index))} className="text-slate-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setPayers((list) => [...list, { userId: members.find((memberRow) => !list.some((payerEntry) => payerEntry.userId === memberRow.userId))?.userId || members[0]?.userId, amount: '' }])
            }
            className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add another payer
          </button>
        </section>

        {/* Split method */}
        <section>
          <span className="text-sm font-medium text-slate-700">Split</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPLIT_TYPES.map((splitOption) => (
              <button
                type="button"
                key={splitOption.key}
                onClick={() => setSplitType(splitOption.key)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  splitType === splitOption.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {splitOption.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2 rounded-xl ring-1 ring-slate-200">
            {splitType !== 'LINE_ITEM' &&
              members.map((memberRow) => {
                const on = participants.includes(memberRow.userId);
                return (
                  <div key={memberRow.userId} className="flex items-center gap-3 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleParticipant(memberRow.userId)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                    <span className="flex-1 text-sm text-slate-700">{memberRow.name}</span>

                    {splitType === 'EQUAL' && on && <span className="text-sm text-slate-500">{formatMoney(perHead, currency)}</span>}

                    {splitType === 'EXACT' && on && (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={exact[memberRow.userId] ?? ''}
                        onChange={(event) => setExact((entry) => ({ ...entry, [memberRow.userId]: event.target.value }))}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    )}

                    {splitType === 'PERCENTAGE' && on && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={percentages[memberRow.userId] ?? ''}
                          onChange={(event) => setPercentages((entry) => ({ ...entry, [memberRow.userId]: event.target.value }))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    )}
                  </div>
                );
              })}

            {splitType === 'LINE_ITEM' && (
              <div className="space-y-3 p-4">
                {items.map((item, index) => (
                  <div key={index} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex gap-2">
                      <input
                        placeholder="Item"
                        value={item.name}
                        onChange={(event) => setItems((currentList) => currentList.map((entry, rowIndex) => (rowIndex === index ? { ...entry, name: event.target.value } : entry)))}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(event) => setItems((currentList) => currentList.map((entry, rowIndex) => (rowIndex === index ? { ...entry, qty: event.target.value } : entry)))}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Price"
                        value={item.price}
                        onChange={(event) => setItems((currentList) => currentList.map((entry, rowIndex) => (rowIndex === index ? { ...entry, price: event.target.value } : entry)))}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button type="button" onClick={() => setItems((currentList) => currentList.filter((_, rowIndex) => rowIndex !== index))} className="text-slate-400 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {members.map((memberRow) => {
                        const on = item.sharedBy?.includes(memberRow.userId);
                        return (
                          <button
                            type="button"
                            key={memberRow.userId}
                            onClick={() =>
                              setItems((currentList) =>
                                currentList.map((entry, rowIndex) =>
                                  rowIndex === index
                                    ? { ...entry, sharedBy: on ? entry.sharedBy.filter((memberId) => memberId !== memberRow.userId) : [...(entry.sharedBy || []), memberRow.userId] }
                                    : entry,
                                ),
                              )
                            }
                            className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
                          >
                            {memberRow.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setItems((currentList) => [...currentList, { name: '', qty: '1', price: '', sharedBy: members.map((memberRow) => memberRow.userId) }])}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </div>
            )}
          </div>
        </section>

        <Field label="Notes" name="notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional" />

        {problem && <payerEntry className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{problem}</payerEntry>}

        <SubmitButton loading={saving} disabled={Boolean(problem)}>
          {editing ? 'Save changes' : 'Add expense'}
        </SubmitButton>
      </form>
    </div>
  );
}
