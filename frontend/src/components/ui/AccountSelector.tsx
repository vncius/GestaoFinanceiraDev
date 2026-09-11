import { Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../../contexts/AccountContext';
import { sortByName } from '../../utils/sort';

export function AccountSelector() {
  const { t } = useTranslation('common');
  const { accountId, setAccountId, accounts } = useAccount();
  const sortedAccounts = sortByName(accounts);

  if (accounts.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Wallet size={15} className="text-gray-400 dark:text-gray-500 shrink-0" />
      <select
        value={accountId ?? ''}
        onChange={(e) => setAccountId(e.target.value)}
        aria-label={t('accountSelector.label')}
        className="bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-1 pr-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none max-w-[160px] sm:max-w-[220px] truncate"
      >
        {sortedAccounts.map((a) => (
          <option key={a.id} value={a.id} className="text-gray-900 dark:text-gray-100">
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
