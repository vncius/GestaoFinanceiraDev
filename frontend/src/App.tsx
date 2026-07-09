import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MonthProvider } from './contexts/MonthContext';
import { DialogProvider } from './contexts/DialogContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import CashFlow from './pages/CashFlow/CashFlow';
import CreditCards from './pages/CreditCards/CreditCards';
import Receivables from './pages/Receivables/Receivables';
import Settings from './pages/Settings/Settings';
import Backup from './pages/Backup/Backup';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DialogProvider>
          <MonthProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="cash-flow" element={<CashFlow />} />
                <Route path="credit-cards" element={<CreditCards />} />
                <Route path="receivables" element={<Receivables />} />
                <Route path="settings" element={<Settings />} />
                <Route path="backup" element={<Backup />} />
              </Route>
            </Routes>
          </MonthProvider>
        </DialogProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
