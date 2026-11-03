import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, Eye, HandCoins, Pencil, Trash2 } from 'lucide-react';
import { deleteGroup } from '../../api/groups.js';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { btn } from '../../components/ui/buttonStyles.js';

const MENU_WIDTH = 208;

// The "Actions" menu for a group, on the groups table and the group page.
// It opens in a portal with fixed positioning, so a table that scrolls
// sideways never clips it.
export default function GroupActions({ group, isAdmin, onDeleted, showOpen = false }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [place, setPlace] = useState(null); // where the open menu sits; null when closed
  const button = useRef(null);
  const menu = useRef(null);

  const items = [
    showOpen && { key: 'open', label: 'Open group', icon: Eye, run: () => navigate(`/groups/${group.id}`) },
    { key: 'settle', label: 'Settle up', icon: HandCoins, run: () => navigate(`/groups/${group.id}/settle`) },
    isAdmin && { key: 'edit', label: 'Edit group', icon: Pencil, run: () => navigate(`/groups/${group.id}/edit`) },
    isAdmin && { key: 'delete', label: 'Delete group', icon: Trash2, danger: true, run: () => remove() },
  ].filter(Boolean);

  const close = (refocus = false) => {
    setPlace(null);
    if (refocus) button.current?.focus();
  };

  const open = () => {
    const rect = button.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    // Open upwards when there is no room below.
    const upwards = rect.bottom + items.length * 40 + 24 > window.innerHeight;
    setPlace(upwards ? { right, bottom: window.innerHeight - rect.top + 6 } : { right, top: rect.bottom + 6 });
  };

  useEffect(() => {
    if (!place) return undefined;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    const onPointer = (event) => {
      if (!menu.current?.contains(event.target) && !button.current?.contains(event.target)) close();
    };
    const onMove = () => close();
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [place]);

  const onMenuKey = (event) => {
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const at = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') close(true);
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      entries.at((at + step) % entries.length)?.focus();
    }
  };

  async function remove() {
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
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (place ? close() : open())}
        aria-haspopup="menu"
        aria-expanded={Boolean(place)}
        aria-label={`Actions for ${group.title}`}
        className={btn.secondary}
      >
        Actions <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${place ? 'rotate-180' : ''}`} />
      </button>

      {place &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Actions for ${group.title}`}
            onKeyDown={onMenuKey}
            style={{ position: 'fixed', width: MENU_WIDTH, ...place }}
            className="z-50 overflow-hidden rounded-lg border border-rule bg-white py-1.5 shadow-lg shadow-ink/10"
          >
            {items.map((item) => (
              <div key={item.key}>
                {item.danger && <div className="my-1.5 border-t border-rule" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    item.run();
                  }}
                  className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm outline-none focus:bg-slate-50 hover:bg-slate-50 ${
                    item.danger ? 'text-red-700' : 'text-ink'
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${item.danger ? 'text-red-600' : 'text-slate-500'}`} strokeWidth={1.75} />
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
