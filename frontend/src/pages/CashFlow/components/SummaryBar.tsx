import { ChevronUp, ChevronDown } from 'lucide-react';
import { CashFlowSummary } from '../../../types';
import { formatCurrency } from '../../../utils/money';

function SummaryCell({
  label,
  value,
  color,
  bold = false,
  border = true,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-2 py-1 lg:py-0 lg:w-[150px] lg:shrink-0 ${border ? 'lg:border-r border-gray-100 dark:border-gray-700' : ''}`}
    >
      <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{label}</span>
      <span className={`text-xs whitespace-nowrap ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function SummaryRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-y-1 lg:flex lg:items-center lg:justify-end lg:gap-0 flex-1">
      {children}
    </div>
  );
}

export function SummaryBar({
  summary: s,
  expanded,
  onToggleExpanded,
}: {
  summary: CashFlowSummary;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;
  const totalExpected = s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices;

  const saldoColor = s.realizedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const prevSaldoColor = s.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const initialColor = 'text-gray-600 dark:text-gray-300';

  return (
    <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-md dark:shadow-gray-900 z-10 rounded-xl">
      <div className="flex items-center px-2 sm:px-4 py-2">
        <SummaryRow>
          <SummaryCell label="Inicial" value={s.initialBalance} color={initialColor} />
          <SummaryCell label="Entradas" value={s.receivedIncome} color="text-green-600 dark:text-green-400" />
          <SummaryCell label="Saídas" value={totalPaid} color="text-red-500 dark:text-red-400" />
          <SummaryCell label="Saldo Final" value={s.realizedBalance} color={saldoColor} bold border={false} />
        </SummaryRow>
        <button
          onClick={onToggleExpanded}
          className="shrink-0 ml-2 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={expanded ? 'Recolher' : 'Ver previstos'}
          aria-label={expanded ? 'Recolher' : 'Ver previstos'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700 sm:border-t-0">
            <SummaryRow>
              <SummaryCell label="Saldo Inicial Previsto" value={s.projectedInitialBalance} color={initialColor} />
              <SummaryCell label="Prev. Entradas" value={s.expectedIncome} color="text-green-600 dark:text-green-400" />
              <SummaryCell label="Prev. Saídas" value={totalExpected} color="text-red-500 dark:text-red-400" />
              <SummaryCell label="Prev. Saldo" value={s.projectedBalance} color={prevSaldoColor} bold border={false} />
            </SummaryRow>
            <div aria-hidden="true" className="invisible shrink-0 ml-2 p-1.5 rounded-lg">
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700">
            <SummaryRow>
              <SummaryCell label="Previsão Inicial Reserva" value={s.reserveProjectedInitialBalance} color={initialColor} />
              <SummaryCell label="Entradas Reserva" value={s.reserveInflow} color="text-amber-600 dark:text-amber-400" />
              <SummaryCell label="Saídas Reserva" value={s.reserveOutflow} color="text-amber-500 dark:text-amber-400" />
              <SummaryCell label="Saldo Reserva" value={s.reserveEndBalance} color="text-amber-600 dark:text-amber-400" bold border={false} />
            </SummaryRow>
            <div aria-hidden="true" className="invisible shrink-0 ml-2 p-1.5 rounded-lg">
              <ChevronDown size={14} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
