import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import Report from './Report';
import { MonthProvider } from '../../contexts/MonthContext';
import { ReportsService } from '../../services/reports.service';
import { CashFlowSummary, StatementReport } from '../../types';

vi.mock('../../services/reports.service', () => ({
  ReportsService: { getStatement: vi.fn(), downloadXlsx: vi.fn() },
}));

const summary = {
  initialBalance: 100000, projectedInitialBalance: 320000, expectedIncome: 500000, receivedIncome: 300000,
  expectedPayments: 100000, paidPayments: 80000, expectedExtraExpenses: 0, paidExtraExpenses: 0,
  creditCardInvoices: 20000, paidCreditCardInvoices: 0, pendingIncome: 200000, pendingIncomeCount: 1,
  pendingExpenses: 40000, pendingExpensesCount: 2, transferInflow: 0, expectedTransferInflow: 0,
  transferOutflow: 10000, expectedTransferOutflow: 10000, projectedBalance: 480000, realizedBalance: 310000,
} as CashFlowSummary;

const report: StatementReport = {
  month: 10, year: 2026,
  scope: { accountId: 'a', accountName: 'Conta PJ' },
  generatedAt: '2026-10-28T12:00:00.000Z',
  summary,
  accounts: [{ id: 'a', name: 'Conta PJ', initialBalance: 100000, balance: 310000 }],
  categories: {
    income: [{ categoryId: 'c1', categoryName: 'Serviços', amount: 300000, percentage: 100 }],
    expenses: [{ categoryId: null, categoryName: 'Sem categoria', amount: 80000, percentage: 100 }],
  },
  evolution: [{ month: 10, year: 2026, income: 300000, expenses: 80000, net: 220000 }],
  incomes: [{ id: '1', date: '2026-10-05T12:00:00.000Z', kind: 'income', description: 'Cliente A', categoryName: 'Serviços', accountName: 'Conta PJ', invoiceRatePct: 6, amount: 300000, settled: true, fixed: false }],
  expenses: [{ id: '2', date: '2026-10-08T12:00:00.000Z', kind: 'invoiceTax', description: 'Imposto NF', categoryName: null, accountName: 'Conta PJ', invoiceRatePct: null, amount: 18000, settled: false, fixed: false }],
  invoices: [{
    id: 'i', cardName: 'Visa', dueDate: '2026-10-10T12:00:00.000Z', status: 'OPEN', paymentAccountName: 'Conta PJ', total: 20000,
    purchases: [
      { purchaseDate: '2026-10-02T12:00:00.000Z', description: 'Notebook', categoryName: 'Equip', installment: '3/10', amount: 25000, refund: false },
      { purchaseDate: '2026-10-03T12:00:00.000Z', description: 'Loja', categoryName: null, installment: null, amount: -5000, refund: true },
    ],
  }],
  transfers: [{ id: 't', date: '2026-10-12T12:00:00.000Z', description: 'Reserva', direction: 'out', fromAccountName: 'Conta PJ', toAccountName: 'Reserva', amount: 10000, settled: true, autoReserve: true }],
};

function renderReport() {
  vi.mocked(ReportsService.getStatement).mockResolvedValue(report);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MonthProvider>
        <MemoryRouter initialEntries={['/report?month=10&year=2026&accountId=a']}>
          <Report />
        </MemoryRouter>
      </MonthProvider>
    </QueryClientProvider>,
  );
}

describe('Relatório do extrato', () => {
  it('lê o statement com mês, ano e conta da URL e mostra as seções', async () => {
    renderReport();
    expect(await screen.findByText('Relatório do extrato')).toBeTruthy();
    expect(ReportsService.getStatement).toHaveBeenCalledWith({ month: 10, year: 2026, accountId: 'a' });
    for (const title of ['Entradas', 'Saídas', 'Cartões de crédito', 'Transferências']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Cliente A')).toBeTruthy();
    expect(screen.getByText('Notebook')).toBeTruthy();
    expect(screen.getByText('3/10')).toBeTruthy();
    expect(screen.getByText(/reserva automática/)).toBeTruthy();
    expect(screen.getByText(/Imposto a pagar/)).toBeTruthy();
  });

  it('desenha os dois gráficos em SVG', async () => {
    const { container } = renderReport();
    await screen.findByText('Relatório do extrato');
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(2);
    expect(container.querySelectorAll('svg[role="img"] rect').length).toBe(2);
  });

  it('Baixar Excel manda o escopo e o idioma', async () => {
    renderReport();
    fireEvent.click(await screen.findByText('Baixar Excel'));
    expect(ReportsService.downloadXlsx).toHaveBeenCalledWith({ month: 10, year: 2026, accountId: 'a' }, 'pt');
  });
});
