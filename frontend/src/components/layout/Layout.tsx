import { Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import Sidebar from './Sidebar';
import { MonthNavigator } from '../ui/MonthNavigator';
import { useTheme } from '../../contexts/ThemeContext';

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
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 grid grid-cols-3 items-center px-6 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{meta.title}</h2>

          {meta.showMonthNav ? (
            <div className="flex justify-center">
              <MonthNavigator />
            </div>
          ) : (
            <div />
          )}

          <div className="flex justify-end">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
