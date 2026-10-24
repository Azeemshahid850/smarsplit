import { Link, NavLink, Outlet } from 'react-router-dom';
import { Wallet, LayoutDashboard, Users, LogOut, PiggyBank, ScanLine, BarChart3 } from 'lucide-react';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/personal', label: 'Personal', icon: PiggyBank },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900 hover:opacity-80">
            <Wallet className="h-5 w-5 text-emerald-600" /> <span className="hidden sm:inline">SmartSplit</span>
          </Link>

          <nav className="flex flex-1 gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition sm:px-3 ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link to="/profile" title="Your profile">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} />
            </Link>
            <button onClick={logout} title="Sign out" className="text-slate-400 hover:text-slate-700">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
