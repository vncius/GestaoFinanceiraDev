import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CashFlowSummary } from '../../../types';
import { formatCurrency } from '../../../utils/money';
import { HelpTip } from '../../../components/ui/Tooltip';
import { projectionRange, summarizeMonth } from '../../../utils/month-summary';
import { formatMonthYearShort } from '../../../utils/date';

// Resumo do mês no topo de Movimentações (U9 do plano de UX). Antes era uma
// barra fixa no rodapé com até 10 números; agora são duas linhas curtas —
// o que já aconteceu e o que ainda falta — e o resto fica em "Ver detalhes".

function Cell({
  label,
  value,
  color,
  tooltip,
  bold = false,
}: {
  label: string;
  value: number;
  color: string;
  tooltip?: string;
  bold?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        {label}
        {tooltip && <HelpTip text={tooltip} />}
      </p>
      <p className={`${bold ? 'text-[15px] sm:text-xl font-bold' : 'text-sm sm:text-lg font-semibold'} ${color} truncate`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

const balanceColor = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400');

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
  // Em mês futuro os previstos acumulam desde o mês atual (U3).
  const range = projectionRange(month, year);
  const rangeLabel = range
    ? t('summaryBar.projectionRange', {
        from: formatMonthYearShort(range.from.month, range.from.year, i18n.language),
        to: formatMonthYearShort(range.to.month, range.to.year, i18n.language),
      })
    : null;

  const details = [
    { label: t('summaryBar.initial'), value: v.initialBalance, tooltip: t('summaryBar.initialTooltip') },
    ...(v.betweenAccounts !== 0
      ? [{ label: t('summaryBar.betweenAccounts'), value: v.betweenAccounts, tooltip: t('summaryBar.betweenAccountsTooltip') }]
      : []),
    { label: t('summaryBar.projectedInitialBalance'), value: v.projectedBase, tooltip: t('summaryBar.projectedInitialBalanceTooltip') },
    { label: t('summaryBar.expectedIncome'), value: v.expectedIncome },
    { label: t('summaryBar.expectedExpense'), value: v.expectedExpenses },
    ...(v.expectedBetweenAccounts !== 0
      ? [{ label: t('summaryBar.expectedBetweenAccounts'), value: v.expectedBetweenAccounts }]
      : []),
  ];

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-5 sm:py-4">
      <div className="grid grid-cols-3 gap-3">
        <Cell label={t('summaryBar.income')} value={v.income} color="text-green-600 dark:text-green-400" />
        <Cell label={t('summaryBar.expense')} value={v.expenses} color="text-red-500 dark:text-red-400" />
        <Cell label={t('summaryBar.finalBalance')} value={v.balance} color={balanceColor(v.balance)} tooltip={t('summaryBar.finalBalanceTooltip')} bold />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <Cell label={t('summaryBar.pendingIncome')} value={v.pendingIncome} color="text-gray-700 dark:text-gray-200" />
        <Cell label={t('summaryBar.pendingExpenses')} value={v.pendingExpenses} color="text-gray-700 dark:text-gray-200" />
        <Cell
          label={t('summaryBar.projectedBalance')}
          value={v.projectedBalance}
          color={balanceColor(v.projectedBalance)}
          tooltip={t('summaryBar.projectedBalanceTooltip')}
          bold
        />
      </div>

      {rangeLabel && (
        <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 text-right">{rangeLabel}</p>
      )}

      <div className="flex justify-center mt-2">
        <button
          onClick={onToggleExpanded}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100"
          aria-expanded={expanded}
        >
          {expanded ? t('summaryBar.collapse') : t('summaryBar.expand')}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-2 text-sm">
              <dt className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                {d.label}
                {d.tooltip && <HelpTip text={d.tooltip} />}
              </dt>
              <dd className="font-semibold text-gray-800 dark:text-gray-100">{formatCurrency(d.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
