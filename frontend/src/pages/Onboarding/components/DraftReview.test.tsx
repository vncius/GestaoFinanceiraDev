import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import DraftReview from './DraftReview';
import {
  OnboardingDraft,
  OnboardingDraftItem,
  OnboardingService,
} from '../../../services/onboarding.service';

vi.mock('../../../services/onboarding.service', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../services/onboarding.service')>();
  return {
    ...original,
    OnboardingService: {
      getDraft: vi.fn(),
      updateDraftItem: vi.fn(),
      removeDraftItem: vi.fn(),
      confirm: vi.fn(),
    },
  };
});

const getDraft = vi.mocked(OnboardingService.getDraft);
const updateDraftItem = vi.mocked(OnboardingService.updateDraftItem);
const removeDraftItem = vi.mocked(OnboardingService.removeDraftItem);
const confirm = vi.mocked(OnboardingService.confirm);

function item(draftItemId: string, payload: Record<string, unknown>): OnboardingDraftItem {
  return {
    draftItemId,
    source: 'ai',
    payload,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function fullDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    accountTypes: [item('atype_1', { name: 'Conta corrente' })],
    accounts: [
      item('acc_1', {
        name: 'Nubank PJ',
        accountTypeRef: 'atype_1',
        initialBalance: 100000,
        isMain: true,
        autoReserveEnabled: false,
        autoReservePercentage: 0,
      }),
    ],
    categories: [item('cat_1', { name: 'Serviços', type: 'INCOME' })],
    incomes: [
      item('inc_1', {
        description: 'Contrato mensal',
        grossAmount: 1200000,
        dayOfMonth: 10,
        incomeCategoryRef: 'cat_1',
        recurrence: 'FIXED',
        reserveAccountRefs: [],
      }),
    ],
    expenses: [],
    creditCards: [],
    settings: item('settings', {
      controlScope: 'BUSINESS',
      minimumMainBalance: 0,
      annualRevenueLimit: 8100000,
      pjLimitControlEnabled: true,
    }),
    ...overrides,
  };
}

function renderReview() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<DraftReview onBackToChat={() => {}} />} />
          <Route path="/dashboard" element={<div>pagina-dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DraftReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza as seções a partir do draft do backend', async () => {
    getDraft.mockResolvedValue(fullDraft());
    renderReview();

    expect(await screen.findByText('Nubank PJ')).toBeInTheDocument();
    expect(screen.getByText('Contrato mensal')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*12\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Controle de limite PJ ativado/)).toBeInTheDocument();
  });

  it('sem conta principal: mostra pendência e desabilita a confirmação', async () => {
    getDraft.mockResolvedValue(
      fullDraft({
        accounts: [item('acc_1', { name: 'Conta', isMain: false })],
      }),
    );
    renderReview();

    expect(await screen.findByTestId('pendencies')).toHaveTextContent(/conta como principal/i);
    expect(screen.getByTestId('confirm-button')).toBeDisabled();
  });

  it('edição: salva patch via updateDraftItem', async () => {
    const draft = fullDraft();
    getDraft.mockResolvedValue(draft);
    updateDraftItem.mockResolvedValue({ item: draft.accounts[0], draft });
    renderReview();

    fireEvent.click(await screen.findByTestId('edit-acc_1'));

    const nameInput = await screen.findByDisplayValue('Nubank PJ');
    fireEvent.change(nameInput, { target: { value: 'Nubank Empresarial' } });
    fireEvent.click(screen.getByTestId('save-item'));

    await waitFor(() =>
      expect(updateDraftItem).toHaveBeenCalledWith(
        'acc_1',
        expect.objectContaining({ name: 'Nubank Empresarial' }),
      ),
    );
  });

  it('remoção: chama removeDraftItem com o id do item', async () => {
    const draft = fullDraft();
    getDraft.mockResolvedValue(draft);
    removeDraftItem.mockResolvedValue({ draft });
    renderReview();

    fireEvent.click(await screen.findByTestId('remove-inc_1'));

    await waitFor(() => expect(removeDraftItem).toHaveBeenCalledWith('inc_1'));
  });

  it('confirmação: envia idempotencyKey e navega para o dashboard', async () => {
    getDraft.mockResolvedValue(fullDraft());
    confirm.mockResolvedValue({ status: 'COMPLETED', appliedEntityIds: {}, alreadyApplied: false });
    renderReview();

    fireEvent.click(await screen.findByTestId('confirm-button'));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('falha na confirmação: mostra erro e o retry usa uma chave nova', async () => {
    getDraft.mockResolvedValue(fullDraft());
    confirm.mockRejectedValueOnce(new Error('O assistente está indisponível no momento.'));
    confirm.mockResolvedValueOnce({
      status: 'COMPLETED',
      appliedEntityIds: {},
      alreadyApplied: false,
    });
    renderReview();

    fireEvent.click(await screen.findByTestId('confirm-button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/retoma de onde parou/i);

    fireEvent.click(screen.getByTestId('confirm-button'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(confirm.mock.calls[0][0]).not.toBe(confirm.mock.calls[1][0]);
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });
});
