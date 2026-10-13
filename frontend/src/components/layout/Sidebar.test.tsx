import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import Sidebar, { BottomNav } from './Sidebar';
import { CreditCardsService } from '../../services/credit-cards.service';

vi.mock('../../services/credit-cards.service', () => ({
  CreditCardsService: { findAll: vi.fn() },
}));

function renderNav(cards: { active: boolean }[]) {
  vi.mocked(CreditCardsService.findAll).mockResolvedValue(cards as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Sidebar />
        <BottomNav />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('navegação principal', () => {
  it('sem cartão ativo, não mostra Cartões; Backup não aparece mais', async () => {
    renderNav([{ active: false }]);
    expect((await screen.findAllByText('Configurações')).length).toBe(2);
    expect(screen.queryByText('Cartões')).toBeNull();
    expect(screen.queryByText(/Backup/)).toBeNull();
  });

  it('com cartão ativo, mostra Cartões na lateral e na barra inferior', async () => {
    renderNav([{ active: true }]);
    expect((await screen.findAllByText('Cartões')).length).toBe(2);
  });
});
