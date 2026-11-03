import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';
import BrandMark from './BrandMark.jsx';
import { NAV_ITEMS, ADMIN_ITEM } from './navItems.js';

/** Desktop navigation: the ink spine of the ledger, active page marked in haldi. */
export default function Sidebar() {
  const { user, logout } = useAuth();
  const items = [...NAV_ITEMS, ...(user.isAdmin ? [ADMIN_ITEM] : [])];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-ink text-white lg:flex">
      <Link to="/" className="px-6 pb-8 pt-7">
        <BrandMark tone="light" />
      </Link>

      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'bg-white/10 font-medium text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-haldi" />}
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
        <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 hover:bg-white/5" title="Your profile">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-white/50">{user.email}</span>
          </span>
        </Link>
        <button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-white/50 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
