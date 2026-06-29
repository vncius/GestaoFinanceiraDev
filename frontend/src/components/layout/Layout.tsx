import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { MonthNavigator } from '../ui/MonthNavigator';

const ROUTE_META: Record<string, { title: string; showMonthNav?: boolean }> = {
  '/dashboard': { title: 'Dashboard', showMonthNav: true },
  '/cash-flow': { title: 'Fluxo de Caixa', showMonthNav: true },
  '/credit-cards': { title: 'Cartões de Crédito', showMonthNav: true },
  '/receivables': { title: 'Recebimentos' },
  '/settings': { title: 'Parametrizações' },
};

export default function Layout() {
  const location = useLocation();
  const segment = '/' + location.pathname.split('/')[1];
  const meta = ROUTE_META[segment] ?? { title: 'Gestão Financeira' };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">{meta.title}</h2>
          {meta.showMonthNav && <MonthNavigator />}
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
