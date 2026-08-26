import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  CheckCircle2,
  BarChart3,
  PieChart,
  PiggyBank,
  History,
  Scale,
  Printer,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { useAccount } from '../../contexts/AccountContext';
import { SettingsService } from '../../services/settings.service';
import { DashboardService } from '../../services/dashboard.service';
import {
  CashFlowSummary,
  CategoryBreakdownItem,
  DashboardAlert,
  MonthlyEvolutionItem,
  UpcomingDue,
} from '../../types';
import { StatCard } from '../../components/ui/StatCard';
import OnboardingBanner from '../../components/onboarding/OnboardingBanner';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency } from '../../utils/money';
import { formatDate, formatMonthYear } from '../../utils/date';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Resultado do mês: o único indicador cujo valor muda de cor pelo sinal
// (verde sobrou / vermelho faltou).
function balanceColor(amount: number) {
  if (amount > 0) return 'text-green-700 dark:text-green-400';
  if (amount < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-900 dark:text-gray-50';
}

// Demais indicadores: cada um tem um matiz de identidade fixo (azul = conta
// operacional, teal = reserva, roxo = total, ardósia = saldo inicial);
// vermelho só quando negativo, para o alerta vencer a identidade.
function identityColor(amount: number, identity: string) {
  return amount < 0 ? 'text-red-600 dark:text-red-400' : identity;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertsBar({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) return null;

  const STYLE = {
    ERROR: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
    WARNING: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
    INFO: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400',
  };
  const ICON = {
    ERROR: <AlertCircle size={15} className="shrink-0" />,
    WARNING: <AlertTriangle size={15} className="shrink-0" />,
    INFO: <Info size={15} className="shrink-0" />,
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium ${STYLE[alert.severity]}`}
        >
          {ICON[alert.severity]}
          {alert.message}
        </div>
      ))}
    </div>
  );
}

function UpcomingDuesCard({ dues }: { dues: UpcomingDue[] }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { setMonthYear } = useMonth();

  const TYPE_ICON: Record<string, React.ReactNode> = {
    PAYMENT: <CreditCard size={14} className="text-orange-500" />,
    EXTRA_EXPENSE: <TrendingDown size={14} className="text-red-500" />,
    CREDIT_CARD_INVOICE: <CreditCard size={14} className="text-purple-500" />,
  };

  function handleDueClick(due: UpcomingDue) {
    const parts = due.dueDate.slice(0, 10).split('-').map(Number);
    setMonthYear(parts[1], parts[0]);
    navigate('/cash-flow');
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('upcomingDue.title')}</h3>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{t('upcomingDue.period')}</span>
      </div>

      {dues.length === 0 ? (
        <EmptyState
          title={t('upcomingDue.empty')}
          icon={<CheckCircle2 size={20} className="text-green-500" />}
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {dues.map((due) => (
            <li
              key={due.id}
              role="button"
              tabIndex={0}
              onClick={() => handleDueClick(due)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDueClick(due); }
              }}
              className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              title={t('upcomingDue.goToCashFlow')}
            >
              <div className="shrink-0">{TYPE_ICON[due.type]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{due.description}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(due.dueDate)}</p>
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 shrink-0">
                {formatCurrency(due.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EvolutionChart({ evolution }: { evolution: MonthlyEvolutionItem[] }) {
  const { t } = useTranslation('dashboard');
  const maxVal = Math.max(
    ...evolution.flatMap((e) => [e.income, e.expenses]),
    1,
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t('evolutionChart.title')}
        </h3>
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
            <div
              key={`${item.month}-${item.year}`}
              className="flex-1 flex flex-col items-center gap-1.5 w-16 shrink-0"
            >
              <div className="flex items-end gap-0.5 h-28 w-full">
                <div
                  className="bg-green-400 flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max((item.income / maxVal) * 100, item.income > 0 ? 2 : 0)}%`,
                    minHeight: item.income > 0 ? 2 : 0,
                  }}
                  title={t('evolutionChart.incomeTooltip', { amount: formatCurrency(item.income) })}
                />
                <div
                  className="bg-red-400 flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max((item.expenses / maxVal) * 100, item.expenses > 0 ? 2 : 0)}%`,
                    minHeight: item.expenses > 0 ? 2 : 0,
                  }}
                  title={t('evolutionChart.expensesTooltip', { amount: formatCurrency(item.expenses) })}
                />
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 text-center leading-tight">
                {String(item.month).padStart(2, '0')}/
                {String(item.year).slice(2)}
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

const CATEGORY_PALETTE = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

function CategoryBreakdownCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: CategoryBreakdownItem[];
}) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t('categoryAnalysis.empty')} />
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={item.categoryId ?? 'none'}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300 truncate">{item.categoryName}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0">
                  {formatCurrency(item.amount)}{' '}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">({item.percentage}%)</span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewDonutCard({ summary }: { summary: CashFlowSummary }) {
  const { t } = useTranslation('dashboard');
  const totalExpenses =
    summary.paidPayments + summary.paidExtraExpenses + summary.paidCreditCardInvoices;

  const segments = [
    { label: t('overview.income'), value: summary.receivedIncome, color: '#22c55e' },
    { label: t('overview.expenses'), value: totalExpenses, color: '#ef4444' },
  ];
  const total = segments.reduce((s, x) => s + x.value, 0);

  let cursor = 0;
  const gradientStops = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const pct = total > 0 ? (seg.value / total) * 100 : 0;
      const start = cursor;
      cursor += pct;
      return `${seg.color} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieChart size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('overview.title')}</h3>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative w-28 h-28 shrink-0">
          <div
            className="w-full h-full rounded-full"
            style={{ background: total > 0 ? `conic-gradient(${gradientStops})` : '#e5e7eb' }}
          />
          <div className="absolute inset-2.5 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
            <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 text-center px-1 leading-tight">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-2 min-w-0">
          {segments.map((seg) => (
            <li key={seg.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.label}
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-100 shrink-0">
                {formatCurrency(seg.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { month, year } = useMonth();
  const { accountId } = useAccount();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: SettingsService.get,
    staleTime: Infinity,
  });
  const scopedToAccount = settings?.dashboardScope === 'ACCOUNT';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', scopedToAccount ? accountId : 'ALL', month, year],
    queryFn: () => DashboardService.get({ month, year, accountId: scopedToAccount ? accountId as string : undefined }),
    enabled: !settings || !scopedToAccount || !!accountId,
  });

  if (isLoading || (scopedToAccount && !accountId)) return <PageLoading />;

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">
          {t('error.loadFailed')}
        </p>
      </div>
    );
  }

  const {
    accounts,
    monthSummary: s,
    upcomingDues,
    alerts,
    monthlyEvolution,
    categoryBreakdown,
  } = data;

  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;

  return (
    <div className="space-y-6">
      {/* Lembrete de onboarding pendente ("responder depois") */}
      <OnboardingBanner />

      {/* Alertas */}
      <AlertsBar alerts={alerts} />

      {/* Saldos das contas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {t('balances.sectionTitle')}
          </h2>
          <a
            href={`/report?month=${month}&year=${year}${scopedToAccount && accountId ? `&accountId=${accountId}` : ''}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <Printer size={13} /> {t('printReport')}
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.list.map((a) => (
            <StatCard
              key={a.id}
              label={a.name}
              value={formatCurrency(a.balance)}
              icon={
                a.isReserve ? (
                  <PiggyBank size={18} className="text-teal-600 dark:text-teal-400" />
                ) : (
                  <Wallet size={18} className="text-blue-600 dark:text-blue-400" />
                )
              }
              iconBg={a.isReserve ? 'bg-teal-50 dark:bg-teal-900/30' : 'bg-blue-50 dark:bg-blue-900/30'}
              valueColor={identityColor(
                a.balance,
                a.isReserve ? 'text-teal-700 dark:text-teal-400' : 'text-blue-700 dark:text-blue-400',
              )}
            />
          ))}
          {!scopedToAccount && (
            <StatCard
              label={t('balances.total')}
              value={formatCurrency(accounts.totalBalance)}
              icon={<DollarSign size={18} className="text-purple-600 dark:text-purple-400" />}
              iconBg="bg-purple-50 dark:bg-purple-900/30"
              valueColor={identityColor(accounts.totalBalance, 'text-purple-700 dark:text-purple-400')}
            />
          )}
        </div>
      </section>

      {/* Resumo do mês */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          {t('summary.sectionTitle', { monthYear: formatMonthYear(month, year) })}
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <StatCard
            label={t('summary.initialBalance')}
            value={formatCurrency(s.initialBalance)}
            icon={<History size={16} className="text-slate-500 dark:text-slate-400" />}
            iconBg="bg-slate-100 dark:bg-slate-700/60"
            valueColor={identityColor(s.initialBalance, 'text-slate-600 dark:text-slate-300')}
            sub={t('summary.initialBalanceSub')}
          />
          <StatCard
            label={t('summary.monthBalance')}
            value={formatCurrency(s.realizedBalance)}
            icon={
              <Scale
                size={16}
                className={s.realizedBalance < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
              />
            }
            iconBg={s.realizedBalance < 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/30'}
            valueColor={balanceColor(s.realizedBalance)}
            sub={t('summary.monthBalanceSub')}
          />
          <StatCard
            label={t('summary.income')}
            value={formatCurrency(s.receivedIncome)}
            icon={<TrendingUp size={16} className="text-green-600" />}
            iconBg="bg-green-50 dark:bg-green-900/30"
            valueColor="text-green-700 dark:text-green-400"
          />
          <StatCard
            label={t('summary.expenses')}
            value={formatCurrency(totalPaid)}
            icon={<TrendingDown size={16} className="text-red-500" />}
            iconBg="bg-red-50 dark:bg-red-900/30"
            valueColor="text-red-600 dark:text-red-400"
          />
        </div>

        {/* Breakdown de saídas consolidadas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[
            { label: t('summary.payments'), value: s.paidPayments },
            { label: t('summary.extraExpenses'), value: s.paidExtraExpenses },
            { label: t('summary.creditCardInvoices'), value: s.paidCreditCardInvoices },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-2"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {formatCurrency(value)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Análise por categoria */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          {t('categoryAnalysis.sectionTitle')}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CategoryBreakdownCard
            title={t('categoryAnalysis.incomeByCategory')}
            icon={<TrendingUp size={16} className="text-green-500" />}
            items={categoryBreakdown.income}
          />
          <CategoryBreakdownCard
            title={t('categoryAnalysis.expensesByCategory')}
            icon={<TrendingDown size={16} className="text-red-500" />}
            items={categoryBreakdown.expenses}
          />
          <OverviewDonutCard summary={s} />
        </div>
      </section>

      {/* Próximos vencimentos */}
      <UpcomingDuesCard dues={upcomingDues} />

      {/* Evolução mensal */}
      <EvolutionChart evolution={monthlyEvolution} />
    </div>
  );
}
