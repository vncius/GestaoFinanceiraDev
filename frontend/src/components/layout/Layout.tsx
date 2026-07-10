import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import { MonthNavigator } from '../ui/MonthNavigator';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { QuickAddProvider } from '../../contexts/QuickAddContext';
import { GlobalShortcuts } from '../GlobalShortcuts';

const ROUTE_META: Record<string, { title: string; showMonthNav?: boolean }> = {
  '/dashboard': { title: 'Dashboard', showMonthNav: true },
  '/cash-flow': { title: 'Fluxo de Caixa', showMonthNav: true },
  '/credit-cards': { title: 'Cartões de Crédito', showMonthNav: true },
  '/receivables': { title: 'Recebimentos' },
  '/backup': { title: 'Backup e Exportação' },
  '/settings': { title: 'Parametrizações' },
};

export default function Layout() {
  const location = useLocation();
  const segment = '/' + location.pathname.split('/')[1];
  const meta = ROUTE_META[segment] ?? { title: 'Gestão Financeira' };
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <QuickAddProvider>
      <GlobalShortcuts />
      <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 px-3 sm:px-6 shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 -ml-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors md:hidden shrink-0"
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>

            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate shrink-0 md:flex-1">
              {meta.title}
            </h2>

            <div className="flex-1 flex justify-end md:flex-1 md:justify-center min-w-0">
              {meta.showMonthNav && <MonthNavigator />}
            </div>

            <div className="flex justify-end shrink-0 md:flex-1">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
                aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-3 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </QuickAddProvider>
  );
}
