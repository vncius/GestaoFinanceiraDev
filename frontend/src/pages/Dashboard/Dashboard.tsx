import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Calendar,
  CheckCircle2,
  BarChart3,
  PiggyBank,
  Wallet,
  Printer,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { useAccount } from '../../contexts/AccountContext';
import { DashboardService } from '../../services/dashboard.service';
import {
  AccountBalance,
  CategoryBreakdownItem,
  MonthlyEvolutionItem,
  UpcomingDue,
} from '../../types';
import OnboardingBanner from '../../components/onboarding/OnboardingBanner';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency } from '../../utils/money';
import { formatDate, formatMonthYear, formatMonthYearShort, lastDayOfMonthISO } from '../../utils/date';
import { MonthSummaryView, projectionRange, summarizeMonth } from '../../utils/month-summary';
import { getAdvancedDetails } from '../../hooks/useAdvancedDetails';

// Início (U8 do plano de UX). De cima para baixo, só o que responde
// "quanto tenho / quanto entrou e saiu / o que ainda falta"; o resto fica
// em "Ver análise completa".

const CARD = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700';
const ANALYSIS_KEY = 'dashboard.analysisOpen';

function signColor(amount: number) {
  if (amount > 0) return 'text-green-700 dark:text-green-400';
  if (amount < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-900 dark:text-gray-50';
}

type MonthTense = 'past' | 'current' | 'future';

function monthTense(month: number, year: number): MonthTense {
  const now = new Date();
  const key = year * 12 + month;
  const currentKey = now.getFullYear() * 12 + now.getMonth() + 1;
  return key < currentKey ? 'past' : key > currentKey ? 'future' : 'current';
}

// ── 1. Destaque: saldo (rótulo depende do mês — D3) ─────────────────────────────

function BalanceHero({ v, month, year }: { v: MonthSummaryView; month: number; year: number }) {
  const { t, i18n } = useTranslation('dashboard');
  const tense = monthTense(month, year);
  const lastDay = formatDate(lastDayOfMonthISO(month, year));
  const range = projectionRange(month, year);

  // Mês futuro: o que importa é o previsto. Atual/passado: o já realizado.
  const label =
    tense === 'current' ? t('hero.today') : tense === 'past' ? t('hero.onDate', { date: lastDay }) : t('hero.projectedOnDate', { date: lastDay });
  const value = tense === 'future' ? v.projectedBalance : v.balance;

  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-3xl sm:text-4xl font-bold mt-1 ${value < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-50'}`}>
        {formatCurrency(value)}
      </p>
      {tense === 'current' && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2" title={t('hero.projectedTooltip')}>
          {t('hero.projectedLine', { date: lastDay })}{' '}
          <span className={`font-semibold ${v.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
            {formatCurrency(v.projectedBalance)}
          </span>
        </p>
      )}
      {tense === 'future' && range && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
          {t('hero.projectionRange', {
            from: formatMonthYearShort(range.from.month, range.from.year, i18n.language),
            to: formatMonthYearShort(range.to.month, range.to.year, i18n.language),
          })}
        </p>
      )}
    </section>
  );
}

// ── 2. Mês: entrou · saiu · sobrou ──────────────────────────────────────────────

function MonthResult({ v, month, year }: { v: MonthSummaryView; month: number; year: number }) {
  const { t } = useTranslation('dashboard');
  const result = v.income - v.expenses;
  const cells = [
    { label: t('month.income'), value: v.income, color: 'text-green-700 dark:text-green-400', icon: <TrendingUp size={15} className="text-green-600" /> },
    { label: t('month.expenses'), value: v.expenses, color: 'text-red-600 dark:text-red-400', icon: <TrendingDown size={15} className="text-red-500" /> },
    { label: result < 0 ? t('month.resultNegative') : t('month.result'), value: Math.abs(result), color: signColor(result), icon: null },
  ];

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
        {t('month.title', { monthYear: formatMonthYear(month, year) })}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {cells.map((c) => (
          <div key={c.label} className={`${CARD} px-3 py-3 sm:px-5 sm:py-4`}>
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">{c.icon}{c.label}</p>
            <p className={`text-base sm:text-xl font-bold mt-1 ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>
      {v.betweenAccounts !== 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('month.betweenAccounts', { amount: formatCurrency(v.betweenAccounts) })}
        </p>
      )}
    </section>
  );
}

// ── 3. Ainda neste mês: a receber / a pagar + próximos vencimentos ──────────────

function DueRow({ due }: { due: UpcomingDue }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { setMonthYear } = useMonth();
  const isIncome = due.type === 'INCOME';

  function open() {
    const [y, m] = due.dueDate.slice(0, 10).split('-').map(Number);
    setMonthYear(m, y);
    navigate('/cash-flow');
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
      className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      title={t('upcoming.goToCashFlow')}
    >
      <div className="shrink-0">
        {isIncome ? (
          <TrendingUp size={14} className="text-green-500" />
        ) : due.type === 'CREDIT_CARD_INVOICE' ? (
          <CreditCard size={14} className="text-purple-500" />
        ) : (
          <TrendingDown size={14} className="text-orange-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{due.description}</p>
        <p className={`text-xs ${due.overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
          {due.overdue ? t('upcoming.overdue', { date: formatDate(due.dueDate) }) : formatDate(due.dueDate)}
        </p>
      </div>
      <span className={`text-sm font-semibold shrink-0 ${isIncome ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {isIncome ? '+' : '−'} {formatCurrency(due.amount)}
      </span>
    </li>
  );
}

const MAX_DUES = 6;

function StillThisMonth({ v, dues, month, year }: { v: MonthSummaryView; dues: UpcomingDue[]; month: number; year: number }) {
  const { t } = useTranslation('dashboard');
  const shown = dues.slice(0, MAX_DUES);

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
        {t('pending.title', { monthYear: formatMonthYear(month, year) })}
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: t('pending.toReceive'), value: v.pendingIncome, count: v.pendingIncomeCount, color: 'text-green-700 dark:text-green-400' },
          { label: t('pending.toPay'), value: v.pendingExpenses, count: v.pendingExpensesCount, color: 'text-red-600 dark:text-red-400' },
        ].map((c) => (
          <div key={c.label} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('pending.count', { count: c.count })}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <Calendar size={14} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('upcoming.title')}</h3>
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('upcoming.empty')} icon={<CheckCircle2 size={20} className="text-green-500" />} />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {shown.map((due) => <DueRow key={`${due.type}-${due.id}`} due={due} />)}
        </ul>
      )}
      <Link
        to="/cash-flow"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        {dues.length > MAX_DUES ? t('upcoming.seeAllCount', { count: dues.length }) : t('upcoming.seeAll')}
        <ArrowRight size={12} />
      </Link>
    </section>
  );
}

// ── 4. Para onde foi o dinheiro ─────────────────────────────────────────────────

const CATEGORY_PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const TOP_CATEGORIES = 5;

function CategoryBars({ items }: { items: CategoryBreakdownItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={item.categoryId ?? `none-${i}`}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300 truncate">{item.categoryName}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0">
              {formatCurrency(item.amount)}{' '}
              <span className="text-gray-400 dark:text-gray-500 font-normal">({item.percentage}%)</span>
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${item.percentage}%`, backgroundColor: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// As N maiores + o resto somado em "Outros".
function topWithOthers(items: CategoryBreakdownItem[], othersLabel: string): CategoryBreakdownItem[] {
  if (items.length <= TOP_CATEGORIES + 1) return items;
  const top = items.slice(0, TOP_CATEGORIES);
  const rest = items.slice(TOP_CATEGORIES);
  return [
    ...top,
    {
      categoryId: null,
      categoryName: othersLabel,
      amount: rest.reduce((s, x) => s + x.amount, 0),
      percentage: rest.reduce((s, x) => s + x.percentage, 0),
    },
  ];
}

function WhereMoneyWent({ items }: { items: CategoryBreakdownItem[] }) {
  const { t } = useTranslation('dashboard');
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t('whereMoneyWent.title')}</h2>
      {items.length === 0 ? (
        <EmptyState title={t('whereMoneyWent.empty')} />
      ) : (
        <CategoryBars items={topWithOthers(items, t('whereMoneyWent.others'))} />
      )}
    </section>
  );
}

// ── 5. Análise completa (recolhida) ─────────────────────────────────────────────

function EvolutionChart({ evolution }: { evolution: MonthlyEvolutionItem[] }) {
  const { t } = useTranslation('dashboard');
  const maxVal = Math.max(...evolution.flatMap((e) => [e.income, e.expenses]), 1);

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('evolutionChart.title')}</h3>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
            {t('evolutionChart.income')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />
            {t('evolutionChart.expenses')}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 min-w-max px-0.5">
          {evolution.map((item) => (
            <div key={`${item.month}-${item.year}`} className="flex-1 flex flex-col items-center gap-1.5 w-16 shrink-0">
              <div className="flex items-end gap-0.5 h-28 w-full">
                <div
                  className="bg-green-400 flex-1 rounded-t-sm"
                  style={{ height: `${(item.income / maxVal) * 100}%`, minHeight: item.income > 0 ? 2 : 0 }}
                  title={t('evolutionChart.incomeTooltip', { amount: formatCurrency(item.income) })}
                />
                <div
                  className="bg-red-400 flex-1 rounded-t-sm"
                  style={{ height: `${(item.expenses / maxVal) * 100}%`, minHeight: item.expenses > 0 ? 2 : 0 }}
                  title={t('evolutionChart.expensesTooltip', { amount: formatCurrency(item.expenses) })}
                />
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 text-center leading-tight">
                {String(item.month).padStart(2, '0')}/{String(item.year).slice(2)}
              </span>
              <p
                className={`text-center text-[11px] font-semibold leading-tight break-words ${
                  item.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`}
                title={t('evolutionChart.resultTooltip', { amount: formatCurrency(item.net) })}
              >
                {item.net >= 0 ? '+' : ''}
                {formatCurrency(item.net)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function readAnalysisOpen(): boolean {
  try {
    const saved = localStorage.getItem(ANALYSIS_KEY);
    // Sem escolha salva, segue a preferência "Mostrar detalhes avançados".
    return saved === null ? getAdvancedDetails() : saved === 'true';
  } catch {
    return false;
  }
}

function FullAnalysis({
  v,
  paid,
  incomeByCategory,
  evolution,
  balances,
  totalBalance,
  showBalances,
  reportHref,
}: {
  v: MonthSummaryView;
  paid: { payments: number; extraExpenses: number; creditCardInvoices: number };
  incomeByCategory: CategoryBreakdownItem[];
  evolution: MonthlyEvolutionItem[];
  balances: AccountBalance[];
  totalBalance: number;
  showBalances: boolean;
  reportHref: string;
}) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(readAnalysisOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(ANALYSIS_KEY, String(next));
    } catch {
      // preferência só de conveniência; sem storage, apenas não é lembrada
    }
  }

  const breakdown = [
    { label: t('analysis.initialBalance'), value: v.initialBalance },
    { label: t('analysis.payments'), value: paid.payments },
    { label: t('analysis.extraExpenses'), value: paid.extraExpenses },
    { label: t('analysis.creditCardInvoices'), value: paid.creditCardInvoices },
    ...(v.betweenAccounts !== 0 ? [{ label: t('analysis.betweenAccounts'), value: v.betweenAccounts }] : []),
    { label: t('analysis.projectedBalance'), value: v.projectedBalance },
  ];

  return (
    <section>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
      >
        {open ? t('analysis.hide') : t('analysis.show')}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="space-y-4 mt-2">
          <div className={`${CARD} p-5`}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('analysis.detailsTitle')}</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
              {breakdown.map((b) => (
                <div key={b.label} className="flex items-center justify-between gap-2 text-sm">
                  <dt className="text-gray-500 dark:text-gray-400">{b.label}</dt>
                  <dd className="font-semibold text-gray-800 dark:text-gray-100">{formatCurrency(b.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {showBalances && (
            <div className={`${CARD} p-5`}>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('analysis.balancesTitle')}</h3>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {balances.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                    {a.isReserve ? (
                      <PiggyBank size={15} className="text-teal-600 dark:text-teal-400" />
                    ) : (
                      <Wallet size={15} className="text-blue-600 dark:text-blue-400" />
                    )}
                    <span className="flex-1 text-gray-700 dark:text-gray-200 truncate">{a.name}</span>
                    <span className={`font-semibold ${a.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
                      {formatCurrency(a.balance)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-2 py-2 text-sm font-semibold">
                  <span className="flex-1 text-gray-700 dark:text-gray-200">{t('analysis.total')}</span>
                  <span className="text-gray-900 dark:text-gray-50">{formatCurrency(totalBalance)}</span>
                </li>
              </ul>
            </div>
          )}

          <div className={`${CARD} p-5`}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t('analysis.incomeByCategory')}</h3>
            {incomeByCategory.length === 0 ? (
              <EmptyState title={t('whereMoneyWent.empty')} />
            ) : (
              <CategoryBars items={incomeByCategory} />
            )}
          </div>

          <EvolutionChart evolution={evolution} />

          <a
            href={reportHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <Printer size={13} /> {t('printReport')}
          </a>
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { month, year } = useMonth();
  // null = "Todas as contas" (consolidado).
  const { scopeAccountId } = useAccount();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', scopeAccountId ?? 'ALL', month, year],
    queryFn: () => DashboardService.get({ month, year, accountId: scopeAccountId ?? undefined }),
  });

  if (isLoading) return <PageLoading />;

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">{t('error.loadFailed')}</p>
      </div>
    );
  }

  const { accounts, monthSummary: s, upcomingDues, monthlyEvolution, categoryBreakdown } = data;
  const v = summarizeMonth(s);
  const reportHref = `/report?month=${month}&year=${year}${scopeAccountId ? `&accountId=${scopeAccountId}` : ''}`;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <OnboardingBanner />

      <BalanceHero v={v} month={month} year={year} />
      <MonthResult v={v} month={month} year={year} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StillThisMonth v={v} dues={upcomingDues} month={month} year={year} />
        <WhereMoneyWent items={categoryBreakdown.expenses} />
      </div>

      <FullAnalysis
        v={v}
        paid={{ payments: s.paidPayments, extraExpenses: s.paidExtraExpenses, creditCardInvoices: s.paidCreditCardInvoices }}
        incomeByCategory={categoryBreakdown.income}
        evolution={monthlyEvolution}
        balances={accounts.list}
        totalBalance={accounts.totalBalance}
        showBalances={scopeAccountId === null && accounts.list.length > 1}
        reportHref={reportHref}
      />
    </div>
  );
}

// Exposto para teste.
export { topWithOthers, monthTense };
