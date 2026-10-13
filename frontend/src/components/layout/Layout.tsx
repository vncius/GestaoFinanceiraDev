import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, LogOut, Loader2, UserCircle, Plus } from 'lucide-react';
import Sidebar, { BottomNav } from './Sidebar';
import { MonthNavigator } from '../ui/MonthNavigator';
import { AccountSelector } from '../ui/AccountSelector';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { QuickAddProvider, useQuickAdd } from '../../contexts/QuickAddContext';
import { GlobalShortcuts } from '../GlobalShortcuts';
import { PageFooterProvider } from '../../contexts/PageFooterContext';

const ROUTE_META: Record<
  string,
  { titleKey: string; showMonthNav?: boolean; showAccountSelector?: boolean; allowAllAccounts?: boolean }
> = {
  '/dashboard': { titleKey: 'nav.dashboard', showMonthNav: true, showAccountSelector: true, allowAllAccounts: true },
  '/cash-flow': { titleKey: 'nav.cashFlow', showMonthNav: true, showAccountSelector: true },
  '/credit-cards': { titleKey: 'nav.creditCards', showMonthNav: true },
  '/settings': { titleKey: 'nav.settings' },
};

// Menu de perfil: concentra o que não é navegação (tema e sair). Idioma e
// tema também ficam em Configurações → Preferências.
function ProfileMenu() {
  const { t } = useTranslation('layout');
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  const itemClass =
    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md disabled:opacity-60';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={t('header.profileMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircle size={20} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1"
        >
          <button role="menuitem" className={itemClass} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          </button>
          <button role="menuitem" className={itemClass} onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
            {t('header.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

// "+ Novo" global (U6): abre o mesmo lançamento rápido do atalho N. No
// desktop fica no cabeçalho; no celular vira botão flutuante acima da barra
// de navegação inferior.
function NewEntryButton() {
  const { t } = useTranslation('common');
  const { openQuickAdd } = useQuickAdd();
  return (
    <>
      <button
        onClick={openQuickAdd}
        className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        title={t('quickAdd.openButtonHint')}
      >
        <Plus size={16} />
        {t('quickAdd.openButton')}
      </button>
      <button
        onClick={openQuickAdd}
        className="md:hidden fixed right-4 bottom-20 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center mb-[env(safe-area-inset-bottom)]"
        aria-label={t('quickAdd.openButton')}
      >
        <Plus size={24} />
      </button>
    </>
  );
}

export default function Layout() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const segment = '/' + location.pathname.split('/')[1];
  const meta = ROUTE_META[segment];
  const title = meta ? t(meta.titleKey) : t('appName');

  return (
    <QuickAddProvider>
      <GlobalShortcuts />
      <div className="flex h-dvh bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 px-3 sm:px-6 shrink-0">
            <h2 className="hidden md:block text-sm font-semibold text-gray-800 dark:text-gray-100 truncate shrink-0 md:flex-1">
              {title}
            </h2>

            <div className="flex-1 flex items-center justify-start md:justify-center gap-3 min-w-0">
              {meta?.showAccountSelector && <AccountSelector allowAll={meta.allowAllAccounts} />}
              {meta?.showMonthNav && <MonthNavigator />}
            </div>

            <div className="flex items-center justify-end shrink-0 md:flex-1">
              <NewEntryButton />
              <ProfileMenu />
            </div>
          </header>

          <h2 className="md:hidden text-sm font-semibold text-gray-800 dark:text-gray-100 truncate bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2 shrink-0">
            {title}
          </h2>

          <PageFooterProvider>
            <main className="flex-1 overflow-auto p-3 sm:p-6">
              <Outlet />
            </main>
          </PageFooterProvider>

          <BottomNav />
        </div>
      </div>
    </QuickAddProvider>
  );
}
