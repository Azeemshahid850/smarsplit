import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../api/reports.js';
import { formatDate } from '../utils/format.js';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState({ notifications: [], unreadCount: 0 });
  const box = useRef(null);

  const load = () => listNotifications({ limit: 15 }).then(setFeed).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (event) => !box.current?.contains(event.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openFeed = () => {
    setOpen((wasOpen) => !wasOpen);
    if (!open) load();
  };

  const read = async (notificationRow) => {
    if (notificationRow.read) return;
    await markNotificationRead(notificationRow.id);
    load();
  };

  const readAll = async () => {
    await markAllNotificationsRead();
    load();
  };

  return (
    <div ref={box} className="relative">
      <button onClick={openFeed} className="relative text-slate-400 hover:text-slate-700" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {feed.unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {feed.unreadCount > 9 ? '9+' : feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-medium">Activity</span>
            {feed.unreadCount > 0 && (
              <button onClick={readAll} className="text-xs text-emerald-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {feed.notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing here yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {feed.notifications.map((notificationRow) => {
                const body = (
                  <>
                    <span className={`block text-sm ${notificationRow.read ? 'text-slate-500' : 'font-medium text-slate-800'}`}>{notificationRow.message}</span>
                    <span className="text-xs text-slate-400">{formatDate(notificationRow.createdAt)}</span>
                  </>
                );
                return (
                  <li key={notificationRow.id} onClick={() => read(notificationRow)} className="cursor-pointer px-4 py-3 hover:bg-slate-50">
                    {notificationRow.groupId ? (
                      <Link to={`/groups/${notificationRow.groupId}`} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
