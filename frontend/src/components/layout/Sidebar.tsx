import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  DollarSign,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cash-flow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { to: '/credit-cards', label: 'Cartões de Crédito', icon: CreditCard },
  { to: '/receivables', label: 'Recebimentos', icon: DollarSign },
  { to: '/settings', label: 'Parametrizações', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-50">Gestão Financeira</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Controle PJ / Pessoal</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
