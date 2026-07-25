import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Moon, Sun, LogOut, Globe } from 'lucide-react';
import Sidebar from './Sidebar';
import { MonthNavigator } from '../ui/MonthNavigator';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Language } from '../../i18n';
import { QuickAddProvider } from '../../contexts/QuickAddContext';
import { GlobalShortcuts } from '../GlobalShortcuts';
import { PageFooterProvider } from '../../contexts/PageFooterContext';

const ROUTE_META: Record<string, { titleKey: string; showMonthNav?: boolean }> = {
  '/dashboard': { titleKey: 'nav.dashboard', showMonthNav: true },
  '/cash-flow': { titleKey: 'nav.cashFlow', showMonthNav: true },
  '/credit-cards': { titleKey: 'nav.creditCards', showMonthNav: true },
  '/receivables': { titleKey: 'nav.receivables' },
  '/backup': { titleKey: 'nav.backup' },
  '/settings': { titleKey: 'nav.settings' },
};

const LANGUAGES: Language[] = ['pt', 'en', 'es'];

export default function Layout() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const segment = '/' + location.pathname.split('/')[1];
  const meta = ROUTE_META[segment];
  const title = meta ? t(meta.titleKey) : t('appName');
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
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
      <div className="flex h-dvh bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 px-3 sm:px-6 shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 -ml-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors md:hidden shrink-0"
              aria-label={t('header.openMenu')}
            >
              <Menu size={18} />
            </button>

            <h2 className="hidden md:block text-sm font-semibold text-gray-800 dark:text-gray-100 truncate shrink-0 md:flex-1">
              {title}
            </h2>

            <div className="flex-1 flex justify-end md:flex-1 md:justify-center min-w-0">
              {meta?.showMonthNav && <MonthNavigator />}
            </div>

            <div className="flex items-center justify-end shrink-0 md:flex-1">
              <div className="flex items-center gap-1 mr-1">
                <Globe size={14} className="text-gray-400 dark:text-gray-500" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  aria-label={t('header.language')}
                  className="bg-transparent text-xs font-medium text-gray-500 dark:text-gray-400 rounded-lg py-1.5 pl-1 pr-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang} className="text-gray-900 dark:text-gray-100">
                      {lang.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
                aria-label={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={t('header.logout')}
                aria-label={t('header.logout')}
              >
                <LogOut size={16} />
              </button>
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
        </div>
      </div>
    </QuickAddProvider>
  );
}
