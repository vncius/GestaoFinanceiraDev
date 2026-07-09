import { CreditCard, Pencil } from 'lucide-react';
import { CreditCardInvoice } from '../../../types';
import { formatCurrency } from '../../../utils/money';
import { formatDate } from '../../../utils/date';
import {
  ActionBtn,
  COL_ACOES,
  COL_CONTA,
  COL_DATA,
  COL_VALOR,
  COL_VALOR_SECUNDARIO,
  PaidToggle,
} from './shared';

export function CreditCardsGrid({
  items,
  cardNames,
  onPay,
  onRevert,
  onOpenInvoice,
}: {
  items: CreditCardInvoice[];
  cardNames: Map<string, string>;
  onPay: (invoice: CreditCardInvoice) => void;
  onRevert: (invoice: CreditCardInvoice) => void;
  onOpenInvoice: (invoice: CreditCardInvoice) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        <CreditCard size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Cartões de Crédito</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              <th className="text-left px-3 sm:px-5 py-2.5 font-medium">Cartão</th>
              <th className={`${COL_CONTA} px-3 py-2.5`} />
              <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
              <th className={`${COL_VALOR_SECUNDARIO} px-3 py-2.5`} />
              <th className={`${COL_VALOR} text-right px-3 py-2.5 font-medium`}>Valor fatura</th>
              <th className={`${COL_DATA} text-left px-3 py-2.5 font-medium`}>Vencimento</th>
              <th className={`${COL_ACOES} px-2 sm:px-3 py-2.5`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {items.map((inv) => (
              <tr
                key={inv.id}
                className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer"
                onClick={() => onOpenInvoice(inv)}
              >
                <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                  {cardNames.get(inv.creditCardId) ?? 'Cartão'}
                </td>
                <td className={`${COL_CONTA} px-3 py-3`} />
                <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                <td className={`${COL_VALOR_SECUNDARIO} px-3 py-3`} />
                <td className={`${COL_VALOR} px-3 py-3 text-right font-semibold text-purple-700 dark:text-purple-400 whitespace-nowrap`}>
                  {formatCurrency(inv.totalAmount)}
                </td>
                <td className={`${COL_DATA} px-3 py-3 text-gray-500 dark:text-gray-400`}>{formatDate(inv.dueDate)}</td>
                <td className={`${COL_ACOES} px-2 sm:px-3 py-3`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    {(inv.status === 'OPEN' || inv.status === 'OVERDUE' || inv.status === 'PAID') && (
                      <PaidToggle
                        paid={inv.status === 'PAID'}
                        urgent={inv.status === 'OVERDUE'}
                        onToggle={() => (inv.status === 'PAID' ? onRevert(inv) : onPay(inv))}
                        paidTitle="Reverter pagamento"
                        unpaidTitle={inv.status === 'OVERDUE' ? 'Fatura vencida — pagar' : 'Pagar fatura'}
                      />
                    )}
                    <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ActionBtn
                        title="Abrir fatura"
                        onClick={() => onOpenInvoice(inv)}
                        className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil size={14} />
                      </ActionBtn>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
