import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { deleteGroup } from '../../api/groups.js';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';

// One "Actions" dropdown for a group, on the groups table and the group page.
// A native select, so a table that scrolls sideways never clips it.
export default function GroupActions({ group, isAdmin, onDeleted, showOpen = false }) {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${group.title}?`,
      description: 'Only a group with no expenses can be deleted. This cannot be undone.',
      confirmLabel: 'Delete group',
    });
    if (!ok) return;
    try {
      await deleteGroup(group.id);
      toast.success(`"${group.title}" deleted`);
      onDeleted();
    } catch (err) {
      toast.error(err.message || 'Could not delete the group');
    }
  };

  const run = (action) => {
    if (action === 'delete') return remove();
    navigate({ open: `/groups/${group.id}`, settle: `/groups/${group.id}/settle`, edit: `/groups/${group.id}/edit` }[action]);
  };

  return (
    <select
      value=""
      onChange={(event) => run(event.target.value)}
      aria-label={`Actions for ${group.title}`}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
    >
      <option value="" disabled>
        Actions
      </option>
      {showOpen && <option value="open">Open</option>}
      <option value="settle">Settle up</option>
      {isAdmin && <option value="edit">Edit group</option>}
      {isAdmin && <option value="delete">Delete group</option>}
    </select>
  );
}
