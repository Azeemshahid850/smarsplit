import { useEffect, useState } from 'react';
import { LogOut, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getHealth } from '../api/client.js';

export default function Home() {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hi, {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-medium">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Auth is live. Groups, expenses, settlement and the personal hub arrive in later phases.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Activity className="h-4 w-4 text-slate-400" />
          {health ? `API ${health.status} · DB ${health.db}` : 'API unreachable'}
        </div>
      </section>
    </main>
  );
}
