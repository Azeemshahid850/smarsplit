import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-400">Restoring session…</div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
