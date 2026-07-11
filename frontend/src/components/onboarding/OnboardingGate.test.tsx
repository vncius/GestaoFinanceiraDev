import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingGate, { deferOnboarding } from './OnboardingGate';
import { OnboardingService } from '../../services/onboarding.service';

vi.mock('../../services/onboarding.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/onboarding.service')>();
  return {
    ...original,
    OnboardingService: {
      getStatus: vi.fn(),
      skip: vi.fn(),
      completeManual: vi.fn(),
    },
  };
});

const getStatus = vi.mocked(OnboardingService.getStatus);

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<OnboardingGate />}>
            <Route path="/dashboard" element={<div>pagina-dashboard</div>} />
            <Route path="/onboarding" element={<div>pagina-onboarding</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function statusResponse(status: string) {
  return {
    status,
    language: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Awaited<ReturnType<typeof OnboardingService.getStatus>>;
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('redireciona novo tenant (PENDING) para /onboarding', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderAt('/dashboard');
    expect(await screen.findByText('pagina-onboarding')).toBeInTheDocument();
  });

  it('redireciona conversa em andamento (IN_PROGRESS) para retomada', async () => {
    getStatus.mockResolvedValue(statusResponse('IN_PROGRESS'));
    renderAt('/dashboard');
    expect(await screen.findByText('pagina-onboarding')).toBeInTheDocument();
  });

  it('não redireciona usuário existente (COMPLETED_MANUAL)', async () => {
    getStatus.mockResolvedValue(statusResponse('COMPLETED_MANUAL'));
    renderAt('/dashboard');
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('não redireciona quem dispensou o assistente (SKIPPED)', async () => {
    getStatus.mockResolvedValue(statusResponse('SKIPPED'));
    renderAt('/dashboard');
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('"responder depois" suprime o redirecionamento na sessão', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    deferOnboarding();
    renderAt('/dashboard');
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('não entra em loop dentro de /onboarding', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderAt('/onboarding');
    expect(await screen.findByText('pagina-onboarding')).toBeInTheDocument();
  });
});
