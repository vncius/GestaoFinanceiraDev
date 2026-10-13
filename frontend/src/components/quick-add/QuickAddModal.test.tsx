import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { QuickAddModal } from './QuickAddModal';
import { DialogProvider } from '../../contexts/DialogContext';
import { useAccount } from '../../contexts/AccountContext';

vi.mock('../../contexts/AccountContext', () => ({ useAccount: vi.fn() }));
vi.mock('../../services/categories.service', () => ({
  CategoriesService: { findAll: vi.fn().mockResolvedValue([]) },
}));

function renderModal(accountCount: number) {
  const accounts = Array.from({ length: accountCount }, (_, i) => ({ id: `a${i}`, name: `Conta ${i}` }));
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
  it('com uma conta, não oferece transferência', () => {
    renderModal(1);
    expect(screen.getByText('Pagamento')).toBeTruthy();
    expect(screen.queryByText('Transferência')).toBeNull();
  });

  it('com duas contas, oferece transferência', () => {
    renderModal(2);
    expect(screen.getByText('Transferência')).toBeTruthy();
  });
});
