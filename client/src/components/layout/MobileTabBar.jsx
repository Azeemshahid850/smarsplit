import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems.js';

/** Phone navigation: the six sections along the bottom, within thumb reach. */
export default function MobileTabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-rule bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-1 py-2 text-[11px] ${isActive ? 'font-medium text-ink' : 'text-slate-500'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span aria-hidden className="absolute inset-x-4 top-0 h-[3px] rounded-b-full bg-haldi" />}
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
