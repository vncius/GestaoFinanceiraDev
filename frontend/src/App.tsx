import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MonthProvider } from './contexts/MonthContext';
import { DialogProvider } from './contexts/DialogContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import CashFlow from './pages/CashFlow/CashFlow';
import CreditCards from './pages/CreditCards/CreditCards';
import Receivables from './pages/Receivables/Receivables';
import Settings from './pages/Settings/Settings';

export default function App() {
  return (
    <BrowserRouter>
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
            </Route>
          </Routes>
        </MonthProvider>
      </DialogProvider>
    </BrowserRouter>
  );
}
