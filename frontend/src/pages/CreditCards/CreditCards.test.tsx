import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import CreditCards from './CreditCards';
import { CreditCardsService } from '../../services/credit-cards.service';
import { useAccount } from '../../contexts/AccountContext';
import { DialogProvider } from '../../contexts/DialogContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../services/credit-cards.service', () => ({
  CreditCardsService: { findAll: vi.fn(), getFlow: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('../../contexts/AccountContext', () => ({ useAccount: vi.fn() }));
vi.mock('../../contexts/MonthContext', () => ({ useMonth: () => ({ month: 10, year: 2026 }) }));

const card = (id: string, name: string, payer: string) => ({
  id, name, bank: 'Banco', closingDay: 5, dueDay: 12, limit: 100000, defaultPaymentAccountId: payer,
  active: true, currentMonth: 10, currentYear: 2026, currentInvoice: null, currentMonthAmount: 0,
  totalOpenAmount: 0, totalFutureAmount: 0, createdAt: '', updatedAt: '',
});

const accounts = [
  { id: 'pf', name: 'Pessoal', active: true },
  { id: 'pj', name: 'Empresa', active: true },
];

function renderPage(scopeAccountId: string | null) {
  vi.mocked(useAccount).mockReturnValue({ scopeAccountId, accounts } as never);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
      <DialogProvider>
        <MemoryRouter>
          <CreditCards />
        </MemoryRouter>
      </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Cartões por conta', () => {
  beforeEach(() => {
    vi.mocked(CreditCardsService.findAll).mockResolvedValue([
      card('c1', 'Nubank', 'pf'),
      card('c2', 'Inter PJ', 'pj'),
    ] as never);
  });

  it('com uma conta selecionada, mostra só os cartões que ela paga', async () => {
    renderPage('pj');
    expect(await screen.findByText('Inter PJ')).toBeTruthy();
    expect(screen.queryByText('Nubank')).toBeNull();
  });

  it('em "Todas as contas", mostra todos agrupados por conta pagadora', async () => {
    renderPage(null);
    expect(await screen.findByText('Nubank')).toBeTruthy();
    expect(screen.getByText('Inter PJ')).toBeTruthy();
    expect(screen.getByText('Pagos por Empresa')).toBeTruthy();
    expect(screen.getByText('Pagos por Pessoal')).toBeTruthy();
  });

  it('conta sem cartão mostra aviso e o botão de novo cartão', async () => {
    vi.mocked(CreditCardsService.findAll).mockResolvedValue([card('c1', 'Nubank', 'pf')] as never);
    renderPage('pj');
    expect(await screen.findByText('Nenhum cartão pago por esta conta')).toBeTruthy();
    expect(screen.getByText('Novo cartão')).toBeTruthy();
  });
});
