import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  PiggyBank,
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
  Target,
  PieChart,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { DashboardService } from '../../services/dashboard.service';
import {
  CashFlowSummary,
  CategoryBreakdownItem,
  DashboardAlert,
  MonthlyEvolutionItem,
  UpcomingDue,
} from '../../types';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency } from '../../utils/money';
import { formatDate, formatMonthYear } from '../../utils/date';

// ── Helpers ───────────────────────────────────────────────────────────────────

function balanceColor(amount: number) {
  if (amount > 0) return 'text-green-700 dark:text-green-400';
  if (amount < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-900 dark:text-gray-50';
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Próximos Vencimentos</h3>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">15 dias</span>
      </div>

      {dues.length === 0 ? (
        <EmptyState
          title="Nenhum vencimento nos próximos 15 dias"
          icon={<CheckCircle2 size={20} className="text-green-500" />}
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {dues.map((due) => (
            <li
              key={due.id}
              onClick={() => handleDueClick(due)}
              className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              title="Ir para o fluxo de caixa deste mês"
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

function AnnualSummaryCard({
  data,
}: {
  data: { grossIncome: number; annualLimit: number; limitUsedPercentage: number; enabled: boolean };
}) {
  const pct = data.limitUsedPercentage;
  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Faturamento Anual</h3>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Faturamento bruto recebido no ano</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {formatCurrency(data.grossIncome)}
          </p>
        </div>

        {data.annualLimit > 0 ? (
          <>
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Utilização do limite</span>
                <span
                  className={
                    pct >= 80 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'
                  }
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 dark:text-gray-500">Limite anual configurado</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {formatCurrency(data.annualLimit)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Configure um limite anual em Parametrizações para acompanhar a utilização.
          </p>
        )}
      </div>
    </div>
  );
}

function EvolutionChart({ evolution }: { evolution: MonthlyEvolutionItem[] }) {
  const maxVal = Math.max(
    ...evolution.flatMap((e) => [e.income, e.expenses]),
    1,
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Evolução dos Últimos Meses
        </h3>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />
            Saídas
          </span>
        </div>
      </div>

      <div className="flex items-end gap-3 h-36">
        {evolution.map((item) => (
          <div
            key={`${item.month}-${item.year}`}
            className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
          >
            <div className="flex items-end gap-0.5 h-28 w-full">
              <div
                className="bg-green-400 flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${Math.max((item.income / maxVal) * 100, item.income > 0 ? 2 : 0)}%`,
                  minHeight: item.income > 0 ? 2 : 0,
                }}
                title={`Entradas: ${formatCurrency(item.income)}`}
              />
              <div
                className="bg-red-400 flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${Math.max((item.expenses / maxVal) * 100, item.expenses > 0 ? 2 : 0)}%`,
                  minHeight: item.expenses > 0 ? 2 : 0,
                }}
                title={`Saídas: ${formatCurrency(item.expenses)}`}
              />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 text-center leading-tight">
              {String(item.month).padStart(2, '0')}/
              {String(item.year).slice(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${evolution.length}, minmax(0, 1fr))` }}
      >
        {evolution.map((item) => (
          <p
            key={`net-${item.month}-${item.year}`}
            className={`text-center text-xs font-semibold truncate ${
              item.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
            }`}
            title={`Resultado: ${formatCurrency(item.net)}`}
          >
            {item.net >= 0 ? '+' : ''}
            {formatCurrency(item.net)}
          </p>
        ))}
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
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Sem lançamentos no período" />
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
  const totalExpenses =
    summary.paidPayments + summary.paidExtraExpenses + summary.paidCreditCardInvoices;

  const segments = [
    { label: 'Receitas', value: summary.receivedIncome, color: '#22c55e' },
    { label: 'Gastos', value: totalExpenses, color: '#ef4444' },
    { label: 'Reserva', value: summary.reserveInflow, color: '#3b82f6' },
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Visão Geral do Mês</h3>
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
  const { month, year } = useMonth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', month, year],
    queryFn: () => DashboardService.get({ month, year }),
  });

  if (isLoading) return <PageLoading />;

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">
          Não foi possível carregar o dashboard. Verifique se o servidor está rodando.
        </p>
      </div>
    );
  }

  const {
    accounts,
    monthSummary: s,
    upcomingDues,
    alerts,
    annualSummary,
    monthlyEvolution,
    categoryBreakdown,
  } = data;

  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;

  return (
    <div className="space-y-6">
      {/* Alertas */}
      <AlertsBar alerts={alerts} />

      {/* Saldos das contas */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Saldos Atuais
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatCard
            label="Conta Principal"
            value={formatCurrency(accounts.main?.balance ?? 0)}
            icon={<Wallet size={18} className="text-blue-600" />}
            iconBg="bg-blue-50 dark:bg-blue-900/30"
            valueColor={balanceColor(accounts.main?.balance ?? 0)}
            sub={accounts.main?.name}
          />
          <StatCard
            label="Reserva de Emergência"
            value={formatCurrency(accounts.emergencyReserve?.balance ?? 0)}
            icon={<PiggyBank size={18} className="text-green-600" />}
            iconBg="bg-green-50 dark:bg-green-900/30"
            valueColor={balanceColor(accounts.emergencyReserve?.balance ?? 0)}
            sub={accounts.emergencyReserve?.name}
          />
          <StatCard
            label="Total Geral"
            value={formatCurrency(accounts.totalBalance)}
            icon={<DollarSign size={18} className="text-purple-600" />}
            iconBg="bg-purple-50 dark:bg-purple-900/30"
            valueColor={balanceColor(accounts.totalBalance)}
          />
        </div>
      </section>

      {/* Resumo do mês */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Resumo de {formatMonthYear(month, year)}
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <StatCard
            label="Saldo Inicial"
            value={formatCurrency(s.initialBalance)}
            valueColor={balanceColor(s.initialBalance)}
            sub="Antes do mês"
          />
          <StatCard
            label="Saldo do Mês"
            value={formatCurrency(s.realizedBalance)}
            valueColor={balanceColor(s.realizedBalance)}
            sub="Consolidado"
          />
          <StatCard
            label="Entradas"
            value={formatCurrency(s.receivedIncome)}
            icon={<TrendingUp size={16} className="text-green-600" />}
            iconBg="bg-green-50 dark:bg-green-900/30"
          />
          <StatCard
            label="Saídas"
            value={formatCurrency(totalPaid)}
            icon={<TrendingDown size={16} className="text-red-500" />}
            iconBg="bg-red-50 dark:bg-red-900/30"
          />
        </div>

        {/* Breakdown de saídas consolidadas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[
            { label: 'Pagamentos', value: s.paidPayments },
            { label: 'Gastos Extras', value: s.paidExtraExpenses },
            { label: 'Faturas Cartão', value: s.paidCreditCardInvoices },
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
          Análise por Categoria
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CategoryBreakdownCard
            title="Receitas por Categoria"
            icon={<TrendingUp size={16} className="text-green-500" />}
            items={categoryBreakdown.income}
          />
          <CategoryBreakdownCard
            title="Gastos por Categoria"
            icon={<TrendingDown size={16} className="text-red-500" />}
            items={categoryBreakdown.expenses}
          />
          <OverviewDonutCard summary={s} />
        </div>
      </section>

      {/* Próximos vencimentos + Resumo anual */}
      {annualSummary.enabled ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UpcomingDuesCard dues={upcomingDues} />
          <AnnualSummaryCard data={annualSummary} />
        </div>
      ) : (
        <UpcomingDuesCard dues={upcomingDues} />
      )}

      {/* Evolução mensal */}
      <EvolutionChart evolution={monthlyEvolution} />
    </div>
  );
}
