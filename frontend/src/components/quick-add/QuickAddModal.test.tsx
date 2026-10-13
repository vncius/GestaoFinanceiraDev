import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { QuickAddModal } from './QuickAddModal';
import { DialogProvider } from '../../contexts/DialogContext';
import { useAccount } from '../../contexts/AccountContext';

vi.mock('../../contexts/AccountContext', () => ({ useAccount: vi.fn() }));
vi.mock('../../contexts/MonthContext', () => ({ useMonth: () => ({ month: 10, year: 2026 }) }));
vi.mock('../../services/categories.service', () => ({
  CategoriesService: { findAll: vi.fn().mockResolvedValue([]) },
}));

function renderModal(accountCount: number) {
  const accounts = Array.from({ length: accountCount }, (_, i) => ({ id: `a${i}`, name: `Conta ${i}`, active: true }));
  vi.mocked(useAccount).mockReturnValue({ accountId: 'a0', accounts } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DialogProvider>
        <QuickAddModal open onClose={() => {}} />
      </DialogProvider>
    </QueryClientProvider>,
  );
}

describe('QuickAddModal', () => {
  it('abre o formulário único (Entrada/Saída) sem atalho de transferência com uma conta', () => {
    renderModal(1);
    expect(screen.getByText('Novo lançamento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saída' })).toBeTruthy();
    expect(screen.queryByText('Transferência entre suas contas')).toBeNull();
  });

  it('com duas contas, o atalho troca para o formulário de transferência', () => {
    renderModal(2);
    fireEvent.click(screen.getByText('Transferência entre suas contas'));
    expect(screen.getByText('Nova Transferência')).toBeTruthy();
  });
});
