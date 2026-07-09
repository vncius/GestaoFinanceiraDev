import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, ArrowLeft } from 'lucide-react';
import { DashboardService } from '../../services/dashboard.service';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { useMonth } from '../../contexts/MonthContext';
import { formatCurrency } from '../../utils/money';
import { formatMonthYear } from '../../utils/date';
import { CategoryBreakdownItem, MonthlyEvolutionItem } from '../../types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-300 pb-1 mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KeyValueRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function CategoryTable({ items }: { items: CategoryBreakdownItem[] }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">Sem lançamentos no período.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((item) => (
          <tr key={item.categoryId ?? 'none'} className="border-b border-gray-100">
            <td className="py-1 text-gray-700">{item.categoryName}</td>
            <td className="py-1 text-right text-gray-500">{item.percentage}%</td>
            <td className="py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(item.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EvolutionTable({ evolution }: { evolution: MonthlyEvolutionItem[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-300">
          <th className="py-1 font-medium">Mês</th>
          <th className="py-1 font-medium text-right">Entradas</th>
          <th className="py-1 font-medium text-right">Saídas</th>
          <th className="py-1 font-medium text-right">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {evolution.map((item) => (
          <tr key={`${item.month}-${item.year}`} className="border-b border-gray-100">
            <td className="py-1 text-gray-700">{formatMonthYear(item.month, item.year)}</td>
            <td className="py-1 text-right text-green-700">{formatCurrency(item.income)}</td>
            <td className="py-1 text-right text-red-700">{formatCurrency(item.expenses)}</td>
            <td className={`py-1 text-right font-medium ${item.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(item.net)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Report() {
  const { month: currentMonth, year: currentYear } = useMonth();
  const [params] = useSearchParams();
  const month = Number(params.get('month')) || currentMonth;
  const year = Number(params.get('year')) || currentYear;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', month, year],
    queryFn: () => DashboardService.get({ month, year }),
  });

  if (isLoading || !data) return <PageLoading />;

  const { accounts, monthSummary: s, annualSummary, monthlyEvolution, categoryBreakdown } = data;
  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-0">
        <div className="no-print flex items-center justify-between mb-6">
          <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> Voltar
          </a>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>

        <header className="mb-6 pb-4 border-b-2 border-gray-800">
          <h1 className="text-xl font-bold text-gray-900">Relatório Financeiro</h1>
          <p className="text-sm text-gray-500">{formatMonthYear(month, year)}</p>
        </header>

        <Section title="Saldos Atuais">
          <KeyValueRow label={accounts.main?.name ?? 'Conta Principal'} value={formatCurrency(accounts.main?.balance ?? 0)} />
          <KeyValueRow label={accounts.emergencyReserve?.name ?? 'Reserva de Emergência'} value={formatCurrency(accounts.emergencyReserve?.balance ?? 0)} />
          <KeyValueRow label="Total Geral" value={formatCurrency(accounts.totalBalance)} bold />
        </Section>

        <Section title={`Resumo de ${formatMonthYear(month, year)}`}>
          <KeyValueRow label="Saldo inicial" value={formatCurrency(s.initialBalance)} />
          <KeyValueRow label="Entradas recebidas" value={formatCurrency(s.receivedIncome)} />
          <KeyValueRow label="Pagamentos" value={formatCurrency(s.paidPayments)} />
          <KeyValueRow label="Gastos extras" value={formatCurrency(s.paidExtraExpenses)} />
          <KeyValueRow label="Faturas de cartão" value={formatCurrency(s.paidCreditCardInvoices)} />
          <KeyValueRow label="Total de saídas" value={formatCurrency(totalPaid)} />
          <KeyValueRow label="Saldo final" value={formatCurrency(s.realizedBalance)} bold />
        </Section>

        <div className="grid grid-cols-2 gap-6">
          <Section title="Receitas por Categoria">
            <CategoryTable items={categoryBreakdown.income} />
          </Section>
          <Section title="Gastos por Categoria">
            <CategoryTable items={categoryBreakdown.expenses} />
          </Section>
        </div>

        {annualSummary.enabled && (
          <Section title="Faturamento Anual (PJ)">
            <KeyValueRow label="Faturamento bruto no ano" value={formatCurrency(annualSummary.grossIncome)} />
            {annualSummary.annualLimit > 0 && (
              <>
                <KeyValueRow label="Limite anual configurado" value={formatCurrency(annualSummary.annualLimit)} />
                <KeyValueRow label="Utilização do limite" value={`${annualSummary.limitUsedPercentage}%`} />
              </>
            )}
          </Section>
        )}

        <Section title="Evolução dos Últimos Meses">
          <EvolutionTable evolution={monthlyEvolution} />
        </Section>

        <p className="no-print text-xs text-gray-300 mt-8">
          Gerado em {new Date().toLocaleString('pt-BR')}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
