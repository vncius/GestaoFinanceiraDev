import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CashFlowSummary } from '../../../types';
import { formatCurrency } from '../../../utils/money';
import { HelpTip } from '../../../components/ui/Tooltip';

function SummaryCell({
  label,
  tooltip,
  value,
  color,
  bold = false,
  border = true,
}: {
  label: string;
  tooltip?: string;
  value: number;
  color: string;
  bold?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-2 py-1 lg:py-0 lg:w-[150px] lg:shrink-0 ${border ? 'lg:border-r border-gray-100 dark:border-gray-700' : ''}`}
    >
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
        {label}
        {tooltip && <HelpTip text={tooltip} />}
      </span>
      <span className={`whitespace-nowrap ${bold ? 'text-sm font-bold' : 'text-xs font-semibold'} ${color}`}>
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
  const { t } = useTranslation('cashFlow');
  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;
  const totalExpected = s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices;

  const saldoColor = s.realizedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const prevSaldoColor = s.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const initialColor = 'text-gray-600 dark:text-gray-300';

  return (
    <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t-2 border-blue-100 dark:border-blue-900/50 shadow-md dark:shadow-gray-900 z-10 rounded-xl">
      <div className="flex items-center px-2 sm:px-4 py-2.5">
        <SummaryRow>
          <SummaryCell label={t('summaryBar.initial')} tooltip={t('summaryBar.initialTooltip')} value={s.initialBalance} color={initialColor} />
          <SummaryCell label={t('summaryBar.income')} value={s.receivedIncome} color="text-green-600 dark:text-green-400" />
          <SummaryCell label={t('summaryBar.expense')} value={totalPaid} color="text-red-500 dark:text-red-400" />
          <SummaryCell label={t('summaryBar.finalBalance')} tooltip={t('summaryBar.finalBalanceTooltip')} value={s.realizedBalance} color={saldoColor} bold border={false} />
        </SummaryRow>
        <button
          onClick={onToggleExpanded}
          className="shrink-0 ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
          aria-label={expanded ? t('summaryBar.collapse') : t('summaryBar.expand')}
          aria-expanded={expanded}
        >
          <span className="hidden sm:inline">{expanded ? t('summaryBar.collapse') : t('summaryBar.expand')}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700 sm:border-t-0">
            <SummaryRow>
              <SummaryCell label={t('summaryBar.projectedInitialBalance')} value={s.projectedInitialBalance} color={initialColor} />
              <SummaryCell label={t('summaryBar.expectedIncome')} value={s.expectedIncome} color="text-green-600 dark:text-green-400" />
              <SummaryCell label={t('summaryBar.expectedExpense')} value={totalExpected} color="text-red-500 dark:text-red-400" />
              <SummaryCell label={t('summaryBar.projectedBalance')} tooltip={t('summaryBar.projectedBalanceTooltip')} value={s.projectedBalance} color={prevSaldoColor} bold border={false} />
            </SummaryRow>
            <div aria-hidden="true" className="invisible shrink-0 ml-2 p-1.5 rounded-lg">
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700">
            <SummaryRow>
              <SummaryCell label={t('summaryBar.reserveProjectedInitialBalance')} value={s.reserveProjectedInitialBalance} color={initialColor} />
              <SummaryCell label={t('summaryBar.reserveInflow')} value={s.reserveInflow} color="text-amber-600 dark:text-amber-400" />
              <SummaryCell label={t('summaryBar.reserveOutflow')} value={s.reserveOutflow} color="text-amber-500 dark:text-amber-400" />
              <SummaryCell label={t('summaryBar.reserveBalance')} tooltip={t('summaryBar.reserveBalanceTooltip')} value={s.reserveEndBalance} color="text-amber-600 dark:text-amber-400" bold border={false} />
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
