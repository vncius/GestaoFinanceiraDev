import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TransferFlowItem } from '../../../types';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatCurrency } from '../../../utils/money';
import { formatDate } from '../../../utils/date';
import { ActionBtn, COL_ACOES, COL_CONTA, COL_DATA, COL_VALOR, COL_VALOR_SECUNDARIO, GridHeader, PaidToggle } from './shared';

export function TransferGrid({
  items,
  onAdd,
  onEdit,
  onSettle,
  onRevert,
  onDelete,
  pendingToggleId,
  pendingDeleteId,
  locked = false,
}: {
  items: TransferFlowItem[];
  onAdd: () => void;
  onEdit: (item: TransferFlowItem) => void;
  onSettle: (transferGroupId: string) => void;
  onRevert: (transferGroupId: string) => void;
  onDelete: (item: TransferFlowItem) => void;
  // Efetivar e reverter compartilham o mesmo joinha, logo o mesmo id de pendência.
  pendingToggleId?: string | null;
  pendingDeleteId?: string | null;
  locked?: boolean;
}) {
  const { t } = useTranslation('cashFlow');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <GridHeader
        title={t('transferGrid.title')}
        icon={<ArrowLeftRight size={16} className="text-blue-500" />}
        count={items.length}
        onAdd={onAdd}
        disabled={locked}
      />

      {items.length === 0 ? (
        <EmptyState title={t('transferGrid.emptyState.title')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-3 sm:px-5 py-2.5 font-medium">{t('grid.columns.description')}</th>
                <th className={`${COL_CONTA} text-left px-3 py-2.5 font-medium`}>{t('transferGrid.columns.counterpart')}</th>
                <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
                <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
                <th className={`${COL_VALOR} text-right px-2 sm:px-3 py-2.5 font-medium`}>{t('transferGrid.columns.amount')}</th>
                <th className={`${COL_DATA} text-left px-3 py-2.5 font-medium`}>{t('transferGrid.columns.date')}</th>
                <th className={`${COL_ACOES} px-1 sm:px-3 py-2.5`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((item) => {
                const rowLocked = locked || pendingDeleteId === item.transferGroupId || pendingToggleId === item.transferGroupId;
                const isIn = item.direction === 'IN';
                const isSettled = item.status === 'PAID' || item.status === 'RECEIVED';
                const isPending = item.status === 'PENDING';
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group ${rowLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    onClick={() => { if (!rowLocked) onEdit(item); }}
                  >
                    <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                      <span className="inline-flex items-center gap-1.5">
                        {isIn ? (
                          <ArrowDownLeft size={13} className="text-green-500 shrink-0" />
                        ) : (
                          <ArrowUpRight size={13} className="text-red-500 shrink-0" />
                        )}
                        {item.description}
                        {item.isAutoReserve && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
                            {t('transferGrid.autoReserveBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${COL_CONTA} px-3 py-3 text-gray-500 dark:text-gray-400 text-xs truncate`}>
                      {isIn ? t('transferGrid.fromLabel', { account: item.counterpartAccountName }) : t('transferGrid.toLabel', { account: item.counterpartAccountName })}
                    </td>
                    <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                    <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                    <td className={`${COL_VALOR} px-2 sm:px-3 py-3 text-right font-semibold whitespace-nowrap ${isIn ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isIn ? '+' : '-'}{formatCurrency(item.amount)}
                    </td>
                    <td className={`${COL_DATA} px-3 py-3 text-gray-500 dark:text-gray-400`}>
                      {formatDate(item.expectedDate)}
                    </td>
                    <td className={`${COL_ACOES} px-1 sm:px-3 py-3`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {(isPending || isSettled) && (
                          <PaidToggle
                            paid={isSettled}
                            loading={pendingToggleId === item.transferGroupId}
                            disabled={locked || pendingDeleteId === item.transferGroupId}
                            onToggle={() =>
                              isSettled ? onRevert(item.transferGroupId) : onSettle(item.transferGroupId)
                            }
                            paidTitle={t('transferGrid.revert')}
                            unpaidTitle={t('transferGrid.settle')}
                          />
                        )}
                        <div
                          className={`hidden md:flex items-center gap-0.5 transition-opacity ${
                            rowLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {item.status !== 'CANCELED' && (
                            <ActionBtn
                              title={t('grid.actions.edit')}
                              onClick={() => onEdit(item)}
                              disabled={rowLocked}
                              className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Pencil size={14} />
                            </ActionBtn>
                          )}
                          {(isPending || isSettled) && (
                            <ActionBtn
                              title={t('grid.actions.delete')}
                              onClick={() => onDelete(item)}
                              loading={pendingDeleteId === item.transferGroupId}
                              disabled={locked || pendingToggleId === item.transferGroupId}
                              className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                            >
                              <Trash2 size={14} />
                            </ActionBtn>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
