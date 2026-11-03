import { Link, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary.jsx';
import NotificationBell from './NotificationBell.jsx';
import Sidebar from './Sidebar.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import BrandMark from './BrandMark.jsx';
import { ADMIN_ITEM } from './navItems.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';

export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const AdminIcon = ADMIN_ITEM.icon;

  return (
    <div className="min-h-screen">
      <Sidebar />

      <div className="lg:pl-64">
        {/* Top bar: brand and profile on a phone; on a desktop only the activity bell. */}
        <header className="sticky top-0 z-10 border-b border-rule bg-white/95 backdrop-blur lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:justify-end lg:px-10 lg:pt-5">
            <Link to="/" className="mr-auto lg:hidden">
              <BrandMark />
            </Link>
            {user.isAdmin && (
              <Link to={ADMIN_ITEM.to} title="Admin" aria-label="Admin" className="text-slate-500 hover:text-ink lg:hidden">
                <AdminIcon className="h-5 w-5" strokeWidth={1.75} />
              </Link>
            )}
            <NotificationBell />
            <Link to="/profile" title="Your profile" className="lg:hidden">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} />
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-2">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
