import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Printer, ArrowLeft } from 'lucide-react';
import { DashboardService } from '../../services/dashboard.service';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { useMonth } from '../../contexts/MonthContext';
import { formatCurrency } from '../../utils/money';
import { formatMonthYear } from '../../utils/date';
import { summarizeMonth } from '../../utils/month-summary';
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
  const { t } = useTranslation('report');
  if (items.length === 0) return <p className="text-xs text-gray-400">{t('category.empty')}</p>;
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
  const { t } = useTranslation('report');
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-300">
          <th className="py-1 font-medium">{t('evolution.month')}</th>
          <th className="py-1 font-medium text-right">{t('evolution.income')}</th>
          <th className="py-1 font-medium text-right">{t('evolution.expenses')}</th>
          <th className="py-1 font-medium text-right">{t('evolution.result')}</th>
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
  const { t } = useTranslation('report');
  const { month: currentMonth, year: currentYear } = useMonth();
  const [params] = useSearchParams();
  const month = Number(params.get('month')) || currentMonth;
  const year = Number(params.get('year')) || currentYear;
  // O link do Dashboard só leva accountId quando o seletor está numa conta;
  // sem ele, o relatório é consolidado (mesma regra do Dashboard).
  const scopeAccountId = params.get('accountId');
  const scopedToAccount = scopeAccountId !== null;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', scopeAccountId ?? 'ALL', month, year],
    queryFn: () => DashboardService.get({ month, year, accountId: scopeAccountId ?? undefined }),
  });

  if (isLoading || !data) return <PageLoading />;

  const { accounts, monthSummary: s, monthlyEvolution, categoryBreakdown } = data;
  const v = summarizeMonth(s);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-0">
        <div className="no-print flex items-center justify-between mb-6">
          <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> {t('backLink')}
          </a>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Printer size={16} /> {t('printButton')}
          </button>
        </div>

        <header className="mb-6 pb-4 border-b-2 border-gray-800">
          <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500">{formatMonthYear(month, year)}</p>
        </header>

        <Section title={t('balances.sectionTitle')}>
          {accounts.list.map((a) => (
            <KeyValueRow key={a.id} label={a.name} value={formatCurrency(a.balance)} />
          ))}
          {!scopedToAccount && (
            <KeyValueRow label={t('balances.total')} value={formatCurrency(accounts.totalBalance)} bold />
          )}
        </Section>

        <Section title={t('summary.sectionTitle', { monthYear: formatMonthYear(month, year) })}>
          <KeyValueRow label={t('summary.initialBalance')} value={formatCurrency(v.initialBalance)} />
          <KeyValueRow label={t('summary.receivedIncome')} value={formatCurrency(v.income)} />
          <KeyValueRow label={t('summary.payments')} value={formatCurrency(s.paidPayments)} />
          <KeyValueRow label={t('summary.extraExpenses')} value={formatCurrency(s.paidExtraExpenses)} />
          <KeyValueRow label={t('summary.creditCardInvoices')} value={formatCurrency(s.paidCreditCardInvoices)} />
          <KeyValueRow label={t('summary.totalExpenses')} value={formatCurrency(v.expenses)} />
          {v.betweenAccounts !== 0 && (
            <KeyValueRow label={t('summary.betweenAccounts')} value={formatCurrency(v.betweenAccounts)} />
          )}
          <KeyValueRow label={t('summary.finalBalance')} value={formatCurrency(v.balance)} bold />
        </Section>

        <div className="grid grid-cols-2 gap-6">
          <Section title={t('category.incomeByCategory')}>
            <CategoryTable items={categoryBreakdown.income} />
          </Section>
          <Section title={t('category.expensesByCategory')}>
            <CategoryTable items={categoryBreakdown.expenses} />
          </Section>
        </div>

        <Section title={t('evolution.sectionTitle')}>
          <EvolutionTable evolution={monthlyEvolution} />
        </Section>

        <p className="no-print text-xs text-gray-300 mt-8">
          {t('footer.generatedAt', { date: new Date().toLocaleString('pt-BR') })}
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
