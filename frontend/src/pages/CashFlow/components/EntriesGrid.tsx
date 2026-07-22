import { TrendingUp, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account, Receivable } from '../../../types';
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

export function EntriesGrid({
  items,
  accounts,
  onAdd,
  onEdit,
  onReceive,
  onRevert,
  onDelete,
  pendingToggleId,
  pendingDeleteId,
}: {
  items: Receivable[];
  accounts: Account[];
  onAdd: () => void;
  onEdit: (item: Receivable) => void;
  onReceive: (id: string) => void;
  onRevert: (id: string) => void;
  onDelete: (item: Receivable) => void;
  pendingToggleId?: string | null;
  pendingDeleteId?: string | null;
}) {
  const { t } = useTranslation('cashFlow');
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <GridHeader
        title={t('entriesGrid.title')}
        icon={<TrendingUp size={16} className="text-green-500" />}
        count={items.length}
        onAdd={onAdd}
      />

      {items.length === 0 ? (
        <EmptyState
          title={t('entriesGrid.emptyState.title')}
          description={t('entriesGrid.emptyState.description')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-3 sm:px-5 py-2.5 font-medium">{t('grid.columns.description')}</th>
                <th className={`${COL_CONTA} text-left px-3 py-2.5 font-medium`}>{t('grid.columns.account')}</th>
                <th className={`${COL_VALOR_SECUNDARIO} text-right px-3 py-2.5 font-medium`}>{t('entriesGrid.columns.grossAmount')}</th>
                <th className={`${COL_VALOR_SECUNDARIO} text-right px-3 py-2.5 font-medium`}>{t('entriesGrid.columns.reserve')}</th>
                <th className={`${COL_VALOR} text-right px-2 sm:px-3 py-2.5 font-medium`}>{t('entriesGrid.columns.netAmount')}</th>
                <th className={`${COL_DATA} text-left px-3 py-2.5 font-medium`}>{t('entriesGrid.columns.expectedDate')}</th>
                <th className={`${COL_ACOES} px-1 sm:px-3 py-2.5`} />
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
                    {item.targetAccountId ? accountMap.get(item.targetAccountId) ?? '—' : '—'}
                  </td>
                  <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3 text-right text-gray-600 dark:text-gray-300`}>
                    {formatCurrency(item.grossAmount)}
                  </td>
                  <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3 text-right text-amber-600 dark:text-amber-400 text-xs`}>
                    {item.reserveAmount > 0 ? formatCurrency(item.reserveAmount) : '—'}
                  </td>
                  <td className={`${COL_VALOR} px-2 sm:px-3 py-3 text-right font-semibold text-green-700 dark:text-green-400 whitespace-nowrap`}>
                    {formatCurrency(item.netAmount)}
                  </td>
                  <td className={`${COL_DATA} px-3 py-3 text-gray-500 dark:text-gray-400`}>
                    {formatDate(item.expectedPaymentDate)}
                  </td>
                  <td className={`${COL_ACOES} px-1 sm:px-3 py-3`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0 sm:gap-0.5">
                      {item.status !== 'CANCELED' && (
                        <PaidToggle
                          paid={item.status === 'RECEIVED'}
                          loading={pendingToggleId === item.id}
                          onToggle={() => (item.status === 'RECEIVED' ? onRevert(item.id) : onReceive(item.id))}
                          paidTitle={t('entriesGrid.toggle.revertReceived')}
                          unpaidTitle={t('entriesGrid.toggle.markReceived')}
                        />
                      )}
                      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ActionBtn
                          title={t('grid.actions.edit')}
                          onClick={() => onEdit(item)}
                          disabled={pendingDeleteId === item.id}
                          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil size={14} />
                        </ActionBtn>
                        {item.status !== 'CANCELED' && (
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
