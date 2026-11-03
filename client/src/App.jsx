import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx';
import { CategoriesProvider } from './context/CategoriesContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import JoinInvitePage from './pages/join/JoinInvitePage.jsx';
import JoinRequestPage from './pages/join/JoinRequestPage.jsx';
import DashboardPage from './pages/dashboard/DashboardPage.jsx';
import GroupsPage from './pages/groups/GroupsPage.jsx';
import PersonalPage from './pages/personal/PersonalPage.jsx';
import GoalsPage from './pages/goals/GoalsPage.jsx';
import ZakatPage from './pages/zakat/ZakatPage.jsx';
import ScanPage from './pages/scan/ScanPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';
import PriceBookPage from './pages/price-book/PriceBookPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';

// Recharts is heavy — only the Reports route pays for it.
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage.jsx'));
import GroupFormPage from './pages/groups/GroupFormPage.jsx';
import GroupDetailPage from './pages/group-detail/GroupDetailPage.jsx';
import AddExpensePage from './pages/add-expense/AddExpensePage.jsx';
import SettleUpPage from './pages/settle-up/SettleUpPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          <Toaster position="bottom-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/join/:inviteToken" element={<JoinInvitePage />} />
            <Route path="/join-request/:joinCode" element={<JoinRequestPage />} />

            <Route element={<ProtectedRoute />}>
              <Route
                element={
                  <CategoriesProvider>
                    <AppLayout />
                  </CategoriesProvider>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/personal" element={<PersonalPage />} />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/zakat" element={<ZakatPage />} />
                <Route path="/scan" element={<ScanPage />} />
                <Route path="/prices" element={<PriceBookPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading reports…</div>}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
                <Route path="/groups/new" element={<GroupFormPage />} />
                <Route path="/groups/:id" element={<GroupDetailPage />} />
                <Route path="/groups/:id/edit" element={<GroupFormPage />} />
                <Route path="/groups/:id/settle" element={<SettleUpPage />} />
                <Route path="/expenses/new" element={<AddExpensePage />} />
                <Route path="/expenses/:expenseId/edit" element={<AddExpensePage />} />
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
