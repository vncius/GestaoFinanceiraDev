import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { DashboardService } from '../../services/dashboard.service';
import {
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
  if (amount > 0) return 'text-green-700';
  if (amount < 0) return 'text-red-600';
  return 'text-gray-900';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertsBar({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) return null;

  const STYLE = {
    ERROR: 'bg-red-50 border-red-200 text-red-700',
    WARNING: 'bg-amber-50 border-amber-200 text-amber-700',
    INFO: 'bg-blue-50 border-blue-200 text-blue-700',
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
  const TYPE_ICON: Record<string, React.ReactNode> = {
    PAYMENT: <CreditCard size={14} className="text-orange-500" />,
    EXTRA_EXPENSE: <TrendingDown size={14} className="text-red-500" />,
    CREDIT_CARD_INVOICE: <CreditCard size={14} className="text-purple-500" />,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">Próximos Vencimentos</h3>
        <span className="ml-auto text-xs text-gray-400">15 dias</span>
      </div>

      {dues.length === 0 ? (
        <EmptyState
          title="Nenhum vencimento nos próximos 15 dias"
          icon={<CheckCircle2 size={20} className="text-green-500" />}
        />
      ) : (
        <ul className="divide-y divide-gray-100">
          {dues.map((due) => (
            <li key={due.id} className="flex items-center gap-3 py-2.5">
              <div className="shrink-0">{TYPE_ICON[due.type]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate">{due.description}</p>
                <p className="text-xs text-gray-400">{formatDate(due.dueDate)}</p>
              </div>
              <span className="text-sm font-semibold text-gray-800 shrink-0">
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
  data: { grossIncome: number; annualLimit: number; limitUsedPercentage: number };
}) {
  const pct = data.limitUsedPercentage;
  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">Faturamento Anual</h3>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Faturamento bruto recebido no ano</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(data.grossIncome)}
          </p>
        </div>

        {data.annualLimit > 0 ? (
          <>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Utilização do limite</span>
                <span
                  className={
                    pct >= 80 ? 'font-semibold text-amber-600' : 'text-gray-600'
                  }
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Limite anual configurado</span>
              <span className="font-medium text-gray-700">
                {formatCurrency(data.annualLimit)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400">
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">
          Evolução dos Últimos Meses
        </h3>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-400">
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
            <span className="text-xs text-gray-400 text-center leading-tight">
              {String(item.month).padStart(2, '0')}/
              {String(item.year).slice(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${evolution.length}, minmax(0, 1fr))` }}
      >
        {evolution.map((item) => (
          <p
            key={`net-${item.month}-${item.year}`}
            className={`text-center text-xs font-semibold truncate ${
              item.net >= 0 ? 'text-green-600' : 'text-red-500'
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
  } = data;

  const totalOutgoing =
    s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices;
  const totalPaid = s.paidPayments + s.paidExtraExpenses;

  return (
    <div className="space-y-6">
      {/* Alertas */}
      <AlertsBar alerts={alerts} />

      {/* Saldos das contas */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Saldos Atuais
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Conta Principal"
            value={formatCurrency(accounts.main?.balance ?? 0)}
            icon={<Wallet size={18} className="text-blue-600" />}
            iconBg="bg-blue-50"
            valueColor={balanceColor(accounts.main?.balance ?? 0)}
            sub={accounts.main?.name}
          />
          <StatCard
            label="Reserva de Emergência"
            value={formatCurrency(accounts.emergencyReserve?.balance ?? 0)}
            icon={<PiggyBank size={18} className="text-green-600" />}
            iconBg="bg-green-50"
            valueColor={balanceColor(accounts.emergencyReserve?.balance ?? 0)}
            sub={accounts.emergencyReserve?.name}
          />
          <StatCard
            label="Total Geral"
            value={formatCurrency(accounts.totalBalance)}
            icon={<DollarSign size={18} className="text-purple-600" />}
            iconBg="bg-purple-50"
            valueColor={balanceColor(accounts.totalBalance)}
          />
        </div>
      </section>

      {/* Resumo do mês */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Resumo de {formatMonthYear(month, year)}
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <StatCard
            label="Saldo Projetado"
            value={formatCurrency(s.projectedBalance)}
            valueColor={balanceColor(s.projectedBalance)}
            sub="Saldo inicial + previstos"
          />
          <StatCard
            label="Saldo Realizado"
            value={formatCurrency(s.realizedBalance)}
            valueColor={balanceColor(s.realizedBalance)}
            sub="Saldo inicial + efetivados"
          />
          <StatCard
            label="Entradas"
            value={formatCurrency(s.expectedIncome)}
            icon={<TrendingUp size={16} className="text-green-600" />}
            iconBg="bg-green-50"
            sub={`${formatCurrency(s.receivedIncome)} recebido`}
          />
          <StatCard
            label="Saídas Previstas"
            value={formatCurrency(totalOutgoing)}
            icon={<TrendingDown size={16} className="text-red-500" />}
            iconBg="bg-red-50"
            sub={`${formatCurrency(totalPaid)} pago`}
          />
        </div>

        {/* Breakdown de saídas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Pagamentos', expected: s.expectedPayments, paid: s.paidPayments },
            { label: 'Gastos Extras', expected: s.expectedExtraExpenses, paid: s.paidExtraExpenses },
            { label: 'Faturas Cartão', expected: s.creditCardInvoices, paid: null },
          ].map(({ label, expected, paid }) => (
            <div
              key={label}
              className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-2"
            >
              <span className="text-xs text-gray-500 shrink-0">{label}</span>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-800">
                  {formatCurrency(expected)}
                </span>
                {paid !== null && (
                  <span className="text-xs text-gray-400 ml-1.5">
                    / {formatCurrency(paid)} pago
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Próximos vencimentos + Resumo anual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingDuesCard dues={upcomingDues} />
        <AnnualSummaryCard data={annualSummary} />
      </div>

      {/* Evolução mensal */}
      <EvolutionChart evolution={monthlyEvolution} />
    </div>
  );
}
