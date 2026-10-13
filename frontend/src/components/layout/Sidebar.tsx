import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, TrendingUp, CreditCard, Settings, LucideIcon } from 'lucide-react';
import { CreditCardsService } from '../../services/credit-cards.service';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const SETTINGS_ITEM: NavItem = { to: '/settings', labelKey: 'nav.settings', icon: Settings };

// Itens principais da navegação. Cartões só aparece para quem tem cartão
// ativo (divulgação progressiva, D1 do plano de UX) — o cadastro do primeiro
// cartão continua em Configurações → Cartões.
function useMainNavItems(): NavItem[] {
  const { data: cards = [] } = useQuery({
    queryKey: ['creditCards'],
    queryFn: () => CreditCardsService.findAll(),
    staleTime: 60_000,
  });
  const hasCards = cards.some((c) => c.active);

  return [
    { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/cash-flow', labelKey: 'nav.cashFlow', icon: TrendingUp },
    ...(hasCards ? [{ to: '/credit-cards', labelKey: 'nav.creditCards', icon: CreditCard }] : []),
  ];
}

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useTranslation('layout');
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
        }`
      }
    >
      <Icon size={18} />
      {t(item.labelKey)}
    </NavLink>
  );
}

// Desktop: barra lateral fixa. No celular a navegação é a BottomNav.
export default function Sidebar() {
  const { t } = useTranslation('layout');
  const items = useMainNavItems();

  return (
    <aside className="hidden md:flex w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-col shrink-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-50">{t('appName')}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('appTagline')}</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <SidebarLink item={SETTINGS_ITEM} />
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center">v1.0.0</p>
      </div>
    </aside>
  );
}

// Celular: barra inferior com os mesmos destinos da lateral.
export function BottomNav() {
  const { t } = useTranslation('layout');
  const items = [...useMainNavItems(), SETTINGS_ITEM];

  return (
    <nav
      aria-label={t('header.mainNav')}
      className="md:hidden flex shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`
          }
        >
          <Icon size={20} />
          <span className="truncate max-w-full px-1">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
