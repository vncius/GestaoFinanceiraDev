import { Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../../contexts/AccountContext';
import { sortByName } from '../../utils/sort';

const ALL = '__ALL__';

// allowAll: telas que aceitam visão consolidada (Dashboard) oferecem "Todas
// as contas"; as que exigem uma conta (Fluxo de Caixa) mostram a última conta
// específica escolhida. Com uma conta só não há o que escolher.
export function AccountSelector({ allowAll = false }: { allowAll?: boolean }) {
  const { t } = useTranslation('common');
  const { accountId, setAccountId, viewAll, setViewAll, accounts } = useAccount();
  const sortedAccounts = sortByName(accounts);

  if (accounts.length <= 1) return null;

  const value = allowAll && viewAll ? ALL : accountId ?? '';

  function handleChange(next: string) {
    if (next === ALL) {
      setViewAll(true);
      return;
    }
    if (allowAll) setViewAll(false);
    setAccountId(next);
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Wallet size={15} className="text-gray-400 dark:text-gray-500 shrink-0" />
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={t('accountSelector.label')}
        className="bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-1 pr-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none max-w-[160px] sm:max-w-[220px] truncate"
      >
        {allowAll && (
          <option value={ALL} className="text-gray-900 dark:text-gray-100">
            {t('accountSelector.all')}
          </option>
        )}
        {sortedAccounts.map((a) => (
          <option key={a.id} value={a.id} className="text-gray-900 dark:text-gray-100">
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
