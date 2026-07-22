import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account, FinancialTransaction } from '../../../types';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatCurrency } from '../../../utils/money';
import { formatDate } from '../../../utils/date';
import {
  ActionBtn,
  COL_ACOES,
  COL_CONTA,
  COL_DATA,
  COL_VALOR,
  COL_VALOR_SECUNDARIO,
  GridHeader,
  PaidToggle,
} from './shared';

export function TransactionGrid({
  title,
  icon,
  items,
  accounts,
  onAdd,
  onEdit,
  onPay,
  onRevert,
  onDelete,
  pendingToggleId,
  pendingDeleteId,
}: {
  title: string;
  icon: React.ReactNode;
  items: FinancialTransaction[];
  accounts: Account[];
  onAdd: () => void;
  onEdit: (item: FinancialTransaction) => void;
  onPay: (id: string) => void;
  onRevert: (id: string) => void;
  onDelete: (item: FinancialTransaction) => void;
  pendingToggleId?: string | null;
  pendingDeleteId?: string | null;
}) {
  const { t } = useTranslation('cashFlow');
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <GridHeader title={title} icon={icon} count={items.length} onAdd={onAdd} />

      {items.length === 0 ? (
        <EmptyState title={t('transactionGrid.emptyState.title')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-3 sm:px-5 py-2.5 font-medium">{t('grid.columns.description')}</th>
                <th className={`${COL_CONTA} text-left px-3 py-2.5 font-medium`}>{t('grid.columns.account')}</th>
                <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
                <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
                <th className={`${COL_VALOR} text-right px-3 py-2.5 font-medium`}>{t('transactionGrid.columns.value')}</th>
                <th className={`${COL_DATA} text-left px-3 py-2.5 font-medium`}>{t('transactionGrid.columns.dueDate')}</th>
                <th className={`${COL_ACOES} px-2 sm:px-3 py-2.5`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer"
                  onClick={() => onEdit(item)}
                >
                  <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                    {item.description}
                  </td>
                  <td className={`${COL_CONTA} px-3 py-3 text-gray-500 dark:text-gray-400 text-xs truncate`}>
                    {item.sourceAccountId ? accountMap.get(item.sourceAccountId) ?? '—' : '—'}
                  </td>
                  <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                  <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                  <td className={`${COL_VALOR} px-3 py-3 text-right font-semibold text-red-600 dark:text-red-400 whitespace-nowrap`}>
                    {formatCurrency(item.amount)}
                  </td>
                  <td className={`${COL_DATA} px-3 py-3 text-gray-500 dark:text-gray-400`}>
                    {formatDate(item.expectedDate)}
                  </td>
                  <td className={`${COL_ACOES} px-2 sm:px-3 py-3`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      {(item.status === 'PENDING' || item.status === 'PAID') && (
                        <PaidToggle
                          paid={item.status === 'PAID'}
                          loading={pendingToggleId === item.id}
                          onToggle={() => (item.status === 'PAID' ? onRevert(item.id) : onPay(item.id))}
                          paidTitle={t('grid.toggle.revertPaid')}
                          unpaidTitle={t('transactionGrid.toggle.markPaid')}
                        />
                      )}
                      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.status !== 'CANCELED' && item.status !== 'REVERSED' && (
                          <ActionBtn
                            title={t('grid.actions.edit')}
                            onClick={() => onEdit(item)}
                            disabled={pendingDeleteId === item.id}
                            className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Pencil size={14} />
                          </ActionBtn>
                        )}
                        {(item.status === 'PENDING' || item.status === 'PAID') && (
                          <ActionBtn
                            title={t('grid.actions.delete')}
                            onClick={() => onDelete(item)}
                            loading={pendingDeleteId === item.id}
                            className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={14} />
                          </ActionBtn>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
