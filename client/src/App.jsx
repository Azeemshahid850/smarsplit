import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Join from './pages/Join.jsx';
import Home from './pages/Home.jsx';
import Groups from './pages/Groups.jsx';
import Personal from './pages/Personal.jsx';
import Scan from './pages/Scan.jsx';

// Recharts is heavy — only the Reports route pays for it.
const Reports = lazy(() => import('./pages/Reports.jsx'));
import CreateGroup from './pages/CreateGroup.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import AddExpense from './pages/AddExpense.jsx';
import SettleUp from './pages/SettleUp.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/join/:inviteToken" element={<Join />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/personal" element={<Personal />} />
              <Route path="/scan" element={<Scan />} />
              <Route
                path="/reports"
                element={
                  <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading reports…</div>}>
                    <Reports />
                  </Suspense>
                }
              />
              <Route path="/groups/new" element={<CreateGroup />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/groups/:id/settle" element={<SettleUp />} />
              <Route path="/expenses/new" element={<AddExpense />} />
              <Route path="/expenses/:expenseId/edit" element={<AddExpense />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
