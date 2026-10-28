import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Printer, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { ReportsService } from '../../services/reports.service';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { useMonth } from '../../contexts/MonthContext';
import { formatCurrency } from '../../utils/money';
import { formatDate, formatMonthYear, formatMonthYearShort } from '../../utils/date';
import { summarizeMonth } from '../../utils/month-summary';
import { CategoryBreakdownItem, StatementLine } from '../../types';

const TOP_SLICES = 8;

function Section({ title, children, newPage = false }: { title: string; children: React.ReactNode; newPage?: boolean }) {
  return (
    <section className={`mb-6 ${newPage ? 'break-before-page' : ''}`}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-300 pb-1 mb-2 break-after-avoid">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  const { t } = useTranslation('report');
  return <p className="text-xs text-gray-400">{t('empty')}</p>;
}

// thead repete a cada página impressa; linhas não se partem.
function DataTable({ head, children, rightFrom }: { head: string[]; children: React.ReactNode; rightFrom: number }) {
  return (
    <table className="w-full text-xs">
      <thead className="table-header-group">
        <tr className="text-left text-gray-500 border-b border-gray-300">
          {head.map((h, i) => (
            <th key={h} className={`py-1 pr-2 font-medium ${i >= rightFrom ? 'text-right' : ''}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr]:break-inside-avoid [&>tr]:border-b [&>tr]:border-gray-100">{children}</tbody>
    </table>
  );
}

function TotalRow({ label, value, span }: { label: string; value: number; span: number }) {
  return (
    <tr className="font-bold border-t border-gray-400">
      <td className="py-1 pr-2" colSpan={span}>{label}</td>
      <td className="py-1 text-right">{formatCurrency(value)}</td>
    </tr>
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
  if (items.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <tbody className="[&>tr]:break-inside-avoid">
        {items.map((item) => (
          <tr key={item.categoryId ?? 'none'} className="border-b border-gray-100">
            <td className="py-1 text-gray-700">{item.categoryId === null ? t('uncategorized') : item.categoryName}</td>
            <td className="py-1 text-right text-gray-500">{item.percentage}%</td>
            <td className="py-1 text-right font-medium text-gray-900 w-28">{formatCurrency(item.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinesTable({ lines, income }: { lines: StatementLine[]; income: boolean }) {
  const { t } = useTranslation('report');
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.reduce((sum, l) => sum + l.amount, 0);
  const head = [t('col.date'), t('col.description'), t('col.category'), t('col.account'), t('col.status'), t('col.amount')];
  return (
    <DataTable head={head} rightFrom={5}>
      {sorted.map((l) => (
        <tr key={l.id}>
          <td className="py-1 pr-2 whitespace-nowrap text-gray-600">{formatDate(l.date)}</td>
          <td className="py-1 pr-2 text-gray-800">
            {l.description}
            {!income && l.kind !== 'payment' && <span className="text-gray-400"> · {t(`kind.${l.kind}`)}</span>}
            {l.invoiceRatePct !== null && <span className="text-gray-400"> · NF {l.invoiceRatePct}%</span>}
          </td>
          <td className="py-1 pr-2 text-gray-600">{l.categoryName ?? t('uncategorized')}</td>
          <td className="py-1 pr-2 text-gray-600">{l.accountName}</td>
          <td className="py-1 pr-2 text-gray-600">{t(l.settled ? (income ? 'status.received' : 'status.paid') : (income ? 'status.toReceive' : 'status.toPay'))}</td>
          <td className="py-1 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(l.amount)}</td>
        </tr>
      ))}
      <TotalRow label={t('total')} value={total} span={5} />
    </DataTable>
  );
}

export default function Report() {
  const { t, i18n } = useTranslation('report');
  const { month: currentMonth, year: currentYear } = useMonth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const month = Number(params.get('month')) || currentMonth;
  const year = Number(params.get('year')) || currentYear;
  // O link do Dashboard só leva accountId quando o seletor está numa conta;
  // sem ele, o relatório é consolidado (mesma regra do Dashboard).
  const scopeAccountId = params.get('accountId');
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['statement-report', scopeAccountId ?? 'ALL', month, year],
    queryFn: () => ReportsService.getStatement({ month, year, accountId: scopeAccountId ?? undefined }),
  });

  if (isLoading || !data) return <PageLoading />;

  const { summary: s, accounts, scope } = data;
  const v = summarizeMonth(s);
  const monthYear = formatMonthYear(month, year);
  const expenseSlices = (() => {
    const items = data.categories.expenses.filter((c) => c.amount > 0);
    const top = items.slice(0, TOP_SLICES).map((c) => ({ label: c.categoryId === null ? t('uncategorized') : c.categoryName, value: c.amount }));
    const rest = items.slice(TOP_SLICES).reduce((sum, c) => sum + c.amount, 0);
    return rest > 0 ? [...top, { label: t('others'), value: rest }] : top;
  })();
  const barData = data.evolution.map((e) => ({ label: formatMonthYearShort(e.month, e.year, i18n.language), income: e.income, expenses: e.expenses }));

  const download = async () => {
    setDownloading(true);
    try {
      await ReportsService.downloadXlsx({ month, year, accountId: scopeAccountId ?? undefined }, i18n.language.slice(0, 2));
    } finally {
      setDownloading(false);
    }
  };

  const invoicesTotal = data.invoices.reduce((sum, i) => sum + i.total, 0);
  const actionBtn = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-0">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-6">
          {/* Volta para a tela de origem (Dashboard ou Fluxo de caixa); aberto direto, vai ao Dashboard. */}
          <button
            type="button"
            onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/dashboard'))}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft size={14} /> {t('backLink')}
          </button>
          <div className="flex gap-2">
            <button onClick={download} disabled={downloading} className={`${actionBtn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
              <FileSpreadsheet size={16} /> {t('downloadExcel')}
            </button>
            <button onClick={() => window.print()} className={`${actionBtn} bg-blue-600 text-white hover:bg-blue-700`}>
              <Printer size={16} /> {t('printButton')}
            </button>
          </div>
        </div>

        <header className="mb-6 pb-4 border-b-2 border-gray-800">
          <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500">
            {monthYear} · {scope.accountName ?? t('allAccounts')}
          </p>
        </header>

        <Section title={t('summary.sectionTitle', { monthYear })}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-300 text-xs">
                <th className="py-1 font-medium" />
                <th className="py-1 font-medium text-right">{t('summary.expected')}</th>
                <th className="py-1 font-medium text-right">{t('summary.realized')}</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr]:border-gray-100">
              <tr>
                <td className="py-1 text-gray-600">{t('summary.initialBalance')}</td>
                <td className="py-1 text-right" />
                <td className="py-1 text-right text-gray-900">{formatCurrency(v.initialBalance)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">{t('summary.income')}</td>
                <td className="py-1 text-right text-gray-500">{formatCurrency(v.expectedIncome)}</td>
                <td className="py-1 text-right text-gray-900">{formatCurrency(v.income)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">{t('summary.totalExpenses')}</td>
                <td className="py-1 text-right text-gray-500">{formatCurrency(v.expectedExpenses)}</td>
                <td className="py-1 text-right text-gray-900">{formatCurrency(v.expenses)}</td>
              </tr>
              {(v.betweenAccounts !== 0 || v.expectedBetweenAccounts !== 0) && (
                <tr>
                  <td className="py-1 text-gray-600">{t('summary.betweenAccounts')}</td>
                  <td className="py-1 text-right text-gray-500">{formatCurrency(v.expectedBetweenAccounts)}</td>
                  <td className="py-1 text-right text-gray-900">{formatCurrency(v.betweenAccounts)}</td>
                </tr>
              )}
              <tr className="font-bold">
                <td className="py-1 text-gray-800">{t('summary.finalBalance')}</td>
                <td className="py-1 text-right">{formatCurrency(v.projectedBalance)}</td>
                <td className="py-1 text-right">{formatCurrency(v.balance)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-2">
            <KeyValueRow label={t('summary.pendingIncome', { count: v.pendingIncomeCount })} value={formatCurrency(v.pendingIncome)} />
            <KeyValueRow label={t('summary.pendingExpenses', { count: v.pendingExpensesCount })} value={formatCurrency(v.pendingExpenses)} />
          </div>
        </Section>

        <Section title={t('balances.sectionTitle')}>
          <DataTable head={[t('col.account'), t('balances.initial'), t('balances.final')]} rightFrom={1}>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="py-1 pr-2 text-gray-800">{a.name}</td>
                <td className="py-1 pr-2 text-right text-gray-600">{formatCurrency(a.initialBalance)}</td>
                <td className="py-1 text-right font-medium text-gray-900">{formatCurrency(a.balance)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <div className="grid grid-cols-1 gap-4 break-inside-avoid">
          <Section title={t('evolution.chartTitle')}>
            {barData.length > 0 ? (
              <BarChart data={barData} incomeLabel={t('evolution.income')} expensesLabel={t('evolution.expenses')} />
            ) : <Empty />}
          </Section>
          <Section title={t('category.expensesByCategory')}>
            {expenseSlices.length > 0 ? <DonutChart slices={expenseSlices} formatValue={formatCurrency} /> : <Empty />}
          </Section>
        </div>

        <Section title={t('sections.incomes')} newPage>
          {data.incomes.length > 0 ? <LinesTable lines={data.incomes} income /> : <Empty />}
        </Section>

        <Section title={t('sections.expenses')}>
          {data.expenses.length > 0 ? <LinesTable lines={data.expenses} income={false} /> : <Empty />}
        </Section>

        <Section title={t('sections.cards')}>
          {data.invoices.length === 0 ? <Empty /> : (
            <>
              {data.invoices.map((inv) => (
                <div key={inv.id} className="mb-4">
                  <div className="flex justify-between text-sm font-semibold text-gray-800 break-after-avoid">
                    <span>
                      {inv.cardName} · {t('cards.due')} {formatDate(inv.dueDate)} · {t(`invoiceStatus.${inv.status}`)}
                      {inv.paymentAccountName && <span className="font-normal text-gray-500"> · {inv.paymentAccountName}</span>}
                    </span>
                    <span>{formatCurrency(inv.total)}</span>
                  </div>
                  <DataTable head={[t('col.date'), t('col.description'), t('col.category'), t('cards.installment'), t('col.amount')]} rightFrom={4}>
                    {inv.purchases.map((p, i) => (
                      <tr key={`${inv.id}-${i}`}>
                        <td className="py-1 pr-2 whitespace-nowrap text-gray-600">{formatDate(p.purchaseDate)}</td>
                        <td className="py-1 pr-2 text-gray-800">{p.description}{p.refund && <span className="text-gray-400"> · {t('cards.refund')}</span>}</td>
                        <td className="py-1 pr-2 text-gray-600">{p.categoryName ?? t('uncategorized')}</td>
                        <td className="py-1 pr-2 text-gray-600">{p.installment ?? ''}</td>
                        <td className="py-1 text-right text-gray-900 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-gray-400 pt-1">
                <span>{t('cards.grandTotal')}</span>
                <span>{formatCurrency(invoicesTotal)}</span>
              </div>
            </>
          )}
        </Section>

        <Section title={t('sections.transfers')}>
          {data.transfers.length === 0 ? <Empty /> : (
            <DataTable head={[t('col.date'), t('col.description'), t('transfers.from'), t('transfers.to'), t('col.status'), t('col.amount')]} rightFrom={5}>
              {data.transfers.map((tr) => (
                <tr key={tr.id}>
                  <td className="py-1 pr-2 whitespace-nowrap text-gray-600">{formatDate(tr.date)}</td>
                  <td className="py-1 pr-2 text-gray-800">{tr.description}{tr.autoReserve && <span className="text-gray-400"> · {t('transfers.autoReserve')}</span>}</td>
                  <td className="py-1 pr-2 text-gray-600">{tr.fromAccountName}</td>
                  <td className="py-1 pr-2 text-gray-600">{tr.toAccountName}</td>
                  <td className="py-1 pr-2 text-gray-600">{t(tr.settled ? 'status.done' : 'status.scheduled')}</td>
                  <td className="py-1 text-right text-gray-900 whitespace-nowrap">{tr.direction === 'out' ? '−' : '+'}{formatCurrency(tr.amount)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Section>

        <div className="grid grid-cols-2 gap-6 print:gap-4">
          <Section title={t('category.incomeByCategory')}>
            <CategoryTable items={data.categories.income} />
          </Section>
          <Section title={t('category.expensesByCategory')}>
            <CategoryTable items={data.categories.expenses} />
          </Section>
        </div>

        <Section title={t('evolution.sectionTitle')}>
          <DataTable head={[t('evolution.month'), t('evolution.income'), t('evolution.expenses'), t('evolution.result')]} rightFrom={1}>
            {data.evolution.map((e) => (
              <tr key={`${e.month}-${e.year}`}>
                <td className="py-1 pr-2 text-gray-700">{formatMonthYear(e.month, e.year)}</td>
                <td className="py-1 pr-2 text-right text-green-700">{formatCurrency(e.income)}</td>
                <td className="py-1 pr-2 text-right text-red-700">{formatCurrency(e.expenses)}</td>
                <td className={`py-1 text-right font-medium ${e.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(e.net)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <p className="text-xs text-gray-400 mt-8">
          {t('footer.generatedAt', { date: new Date(data.generatedAt).toLocaleString(i18n.language) })}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 1.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
