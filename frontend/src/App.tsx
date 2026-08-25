import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { MonthProvider } from './contexts/MonthContext';
import { DialogProvider } from './contexts/DialogContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import OnboardingGate from './components/onboarding/OnboardingGate';
import Layout from './components/layout/Layout';
import Onboarding from './pages/Onboarding/Onboarding';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import CashFlow from './pages/CashFlow/CashFlow';
import CreditCards from './pages/CreditCards/CreditCards';
import Settings from './pages/Settings/Settings';
import Backup from './pages/Backup/Backup';
import Report from './pages/Report/Report';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <DialogProvider>
            <MonthProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  {/* Gate de onboarding: novos tenants são levados para /onboarding. */}
                  <Route element={<OnboardingGate />}>
                    <Route path="/" element={<Layout />}>
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard" element={<Dashboard />} />
                      <Route path="cash-flow" element={<CashFlow />} />
                      <Route path="credit-cards" element={<CreditCards />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="backup" element={<Backup />} />
                    </Route>
                    {/* Fora do Layout: página de relatório para impressão, sem sidebar/header. */}
                    <Route path="/report" element={<Report />} />
                    {/* Fora do Layout: jornada de primeiro acesso, sem sidebar. */}
                    <Route path="/onboarding" element={<Onboarding />} />
                  </Route>
                </Route>
              </Routes>
            </MonthProvider>
          </DialogProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
