import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CashFlowSummary } from '../../../types';
import { formatCurrency } from '../../../utils/money';
import { HelpTip } from '../../../components/ui/Tooltip';
import { projectionRange, summarizeMonth } from '../../../utils/month-summary';
import { formatMonthYearShort } from '../../../utils/date';

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

const TOGGLE_BUTTON_CLASS =
  'shrink-0 ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors';

// Espelha exatamente a marcação do botão de alternância (mesmo texto/ícone)
// para que as linhas recolhidas ocupem a mesma largura e a barra não desalinhe.
function ToggleSpacer({ label }: { label: string }) {
  return (
    <span aria-hidden="true" className={`${TOGGLE_BUTTON_CLASS} invisible border-transparent`}>
      <span className="hidden sm:inline">{label}</span>
      <ChevronDown size={14} />
    </span>
  );
}

export function SummaryBar({
  summary: s,
  month,
  year,
  expanded,
  onToggleExpanded,
}: {
  summary: CashFlowSummary;
  month: number;
  year: number;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { t, i18n } = useTranslation('cashFlow');
  const v = summarizeMonth(s);
  // Em mês futuro os previstos acumulam desde o mês atual: o intervalo vai
  // escrito na linha de previstos para não parecer valor só deste mês.
  const range = projectionRange(month, year);
  const rangeLabel = range
    ? t('summaryBar.projectionRange', {
        from: formatMonthYearShort(range.from.month, range.from.year, i18n.language),
        to: formatMonthYearShort(range.to.month, range.to.year, i18n.language),
      })
    : null;
  // Transferência não é entrada nem saída: tem coluna própria, exibida só
  // quando há alguma no mês (realizada ou prevista). Nas duas linhas, para
  // não desalinhar as colunas quando a barra está expandida.
  const showBetween = v.betweenAccounts !== 0 || v.expectedBetweenAccounts !== 0;

  const saldoColor = v.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const prevSaldoColor = v.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const initialColor = 'text-gray-600 dark:text-gray-300';
  const betweenColor = 'text-gray-600 dark:text-gray-300';

  return (
    <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center px-3 sm:px-6 py-2.5">
        <SummaryRow>
          <SummaryCell label={t('summaryBar.initial')} tooltip={t('summaryBar.initialTooltip')} value={v.initialBalance} color={initialColor} />
          <SummaryCell label={t('summaryBar.income')} value={v.income} color="text-green-600 dark:text-green-400" />
          <SummaryCell label={t('summaryBar.expense')} value={v.expenses} color="text-red-500 dark:text-red-400" />
          {showBetween && (
            <SummaryCell label={t('summaryBar.betweenAccounts')} tooltip={t('summaryBar.betweenAccountsTooltip')} value={v.betweenAccounts} color={betweenColor} />
          )}
          <SummaryCell label={t('summaryBar.finalBalance')} tooltip={t('summaryBar.finalBalanceTooltip')} value={v.balance} color={saldoColor} bold border={false} />
        </SummaryRow>
        <button
          onClick={onToggleExpanded}
          className={`${TOGGLE_BUTTON_CLASS} bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700`}
          aria-label={expanded ? t('summaryBar.collapse') : t('summaryBar.expand')}
          aria-expanded={expanded}
        >
          <span className="hidden sm:inline">{expanded ? t('summaryBar.collapse') : t('summaryBar.expand')}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {expanded && rangeLabel && (
        <p className="px-3 sm:px-6 pt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 text-right border-t border-gray-100 dark:border-gray-700 sm:border-t-0">
          {rangeLabel}
        </p>
      )}
      {expanded && (
        <div className={`flex items-center px-3 sm:px-6 py-2 ${rangeLabel ? '' : 'border-t border-gray-100 dark:border-gray-700 sm:border-t-0'}`}>
          <SummaryRow>
            <SummaryCell label={t('summaryBar.projectedInitialBalance')} tooltip={t('summaryBar.projectedInitialBalanceTooltip')} value={v.projectedBase} color={initialColor} />
            <SummaryCell label={t('summaryBar.expectedIncome')} value={v.expectedIncome} color="text-green-600 dark:text-green-400" />
            <SummaryCell label={t('summaryBar.expectedExpense')} value={v.expectedExpenses} color="text-red-500 dark:text-red-400" />
            {showBetween && (
              <SummaryCell label={t('summaryBar.expectedBetweenAccounts')} value={v.expectedBetweenAccounts} color={betweenColor} />
            )}
            <SummaryCell label={t('summaryBar.projectedBalance')} tooltip={t('summaryBar.projectedBalanceTooltip')} value={v.projectedBalance} color={prevSaldoColor} bold border={false} />
          </SummaryRow>
          <ToggleSpacer label={t('summaryBar.collapse')} />
        </div>
      )}
    </div>
  );
}
