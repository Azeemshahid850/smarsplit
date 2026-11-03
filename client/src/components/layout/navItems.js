import { LayoutDashboard, Users, PiggyBank, Target, ScanLine, BarChart3, ShieldCheck } from 'lucide-react';

// The app's sections, shared by the desktop sidebar and the phone tab bar.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/personal', label: 'Personal', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

// Only people listed in ADMIN_EMAILS on the server get this one.
export const ADMIN_ITEM = { to: '/admin', label: 'Admin', icon: ShieldCheck };
