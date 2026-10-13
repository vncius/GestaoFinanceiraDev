import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import Dashboard, { topWithOthers } from './Dashboard';
import { DashboardService } from '../../services/dashboard.service';
import { useAccount } from '../../contexts/AccountContext';
import { useMonth } from '../../contexts/MonthContext';
import { CashFlowSummary, DashboardResponse } from '../../types';

vi.mock('../../services/dashboard.service', () => ({ DashboardService: { get: vi.fn() } }));
vi.mock('../../contexts/AccountContext', () => ({ useAccount: vi.fn() }));
vi.mock('../../contexts/MonthContext', () => ({ useMonth: vi.fn() }));
vi.mock('../../components/onboarding/OnboardingBanner', () => ({ default: () => null }));

const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();

const summary: CashFlowSummary = {
  initialBalance: 100000, projectedInitialBalance: 150000, receivedIncome: 80000, expectedIncome: 20000,
  paidPayments: 30000, expectedPayments: 10000, paidExtraExpenses: 0, expectedExtraExpenses: 0,
  paidCreditCardInvoices: 0, creditCardInvoices: 0, pendingIncome: 20000, pendingIncomeCount: 1,
  pendingExpenses: 10000, pendingExpensesCount: 1, transferInflow: 0, transferOutflow: 0,
  expectedTransferInflow: 0, expectedTransferOutflow: 0, realizedBalance: 150000, projectedBalance: 160000,
};

function response(): DashboardResponse {
  return {
    month, year,
    accounts: { list: [{ id: 'a', name: 'Conta A', balance: 150000, isReserve: false }], totalBalance: 150000 },
    monthSummary: summary,
    upcomingDues: [
      { type: 'PAYMENT', id: '1', description: 'Aluguel', dueDate: '2020-01-05T12:00:00.000Z', amount: 10000, status: 'PENDING', overdue: true },
      { type: 'INCOME', id: '2', description: 'Salário', dueDate: `${year}-${String(month).padStart(2, '0')}-28T12:00:00.000Z`, amount: 20000, status: 'PENDING', overdue: false },
    ],
    alerts: [{ type: 'OVERDUE_PAYMENT', message: 'BANNER DE ALERTA ANTIGO', severity: 'ERROR' }],
    monthlyEvolution: [],
    categoryBreakdown: {
      income: [],
      expenses: [{ categoryId: 'c1', categoryName: 'Moradia', amount: 30000, percentage: 100 }],
    },
  };
}

function renderDashboard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Início', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(DashboardService.get).mockResolvedValue(response());
    vi.mocked(useAccount).mockReturnValue({ scopeAccountId: null } as never);
    vi.mocked(useMonth).mockReturnValue({ month, year, setMonthYear: vi.fn() } as never);
  });

  it('mostra saldo de hoje, previsto, entrou/saiu/sobrou e a receber/a pagar', async () => {
    renderDashboard();
    expect(await screen.findByText('Saldo hoje')).toBeTruthy();
    expect(screen.getByText(/Previsto para/)).toBeTruthy();
    expect(screen.getByText('Entrou')).toBeTruthy();
    expect(screen.getByText('Sobrou')).toBeTruthy();
    expect(screen.getByText('A receber')).toBeTruthy();
    expect(screen.getByText('A pagar')).toBeTruthy();
  });

  it('alertas viram itens atrasados da lista, sem banner', async () => {
    renderDashboard();
    expect(await screen.findByText(/Atrasado desde/)).toBeTruthy();
    expect(screen.queryByText('BANNER DE ALERTA ANTIGO')).toBeNull();
    expect(screen.getByText('Salário')).toBeTruthy();
  });

  it('análise completa começa recolhida e abre sob demanda', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByText('Ver análise completa'));
    expect(screen.getByText('Saldo no início do mês')).toBeTruthy();
    expect(screen.getByText('Relatório para impressão')).toBeTruthy();
  });
});

describe('topWithOthers', () => {
  it('agrupa o que passa das 5 maiores em "Outros"', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ categoryId: `c${i}`, categoryName: `C${i}`, amount: 100, percentage: 12 }));
    const out = topWithOthers(items, 'Outros');
    expect(out).toHaveLength(6);
    expect(out[5]).toMatchObject({ categoryName: 'Outros', amount: 300, percentage: 36 });
  });
});
