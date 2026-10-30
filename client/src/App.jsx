import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import { CategoriesProvider } from './context/CategoriesContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Join from './pages/Join.jsx';
import JoinRequest from './pages/JoinRequest.jsx';
import Home from './pages/Home.jsx';
import Groups from './pages/Groups.jsx';
import Personal from './pages/Personal.jsx';
import Goals from './pages/Goals.jsx';
import Scan from './pages/Scan.jsx';
import Profile from './pages/Profile.jsx';
import PriceBook from './pages/PriceBook.jsx';
import Admin from './pages/Admin.jsx';

// Recharts is heavy — only the Reports route pays for it.
const Reports = lazy(() => import('./pages/Reports.jsx'));
import CreateGroup from './pages/CreateGroup.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import AddExpense from './pages/AddExpense.jsx';
import SettleUp from './pages/SettleUp.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          <Toaster position="bottom-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/join/:inviteToken" element={<Join />} />
            <Route path="/join-request/:joinCode" element={<JoinRequest />} />

            <Route element={<ProtectedRoute />}>
              <Route
                element={
                  <CategoriesProvider>
                    <AppLayout />
                  </CategoriesProvider>
                }
              >
                <Route path="/" element={<Home />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/personal" element={<Personal />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/prices" element={<PriceBook />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/profile" element={<Profile />} />
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
        </ConfirmProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
