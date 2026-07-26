import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import Onboarding from './Onboarding';
import { OnboardingService } from '../../services/onboarding.service';
import { AuthService } from '../../services/auth.service';
import { AuthProvider } from '../../contexts/AuthContext';
import { LanguageProvider } from '../../contexts/LanguageContext';

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

vi.mock('../../services/auth.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/auth.service')>();
  return {
    ...original,
    AuthService: {
      me: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    },
  };
});

const getStatus = vi.mocked(OnboardingService.getStatus);
const skip = vi.mocked(OnboardingService.skip);
const authMe = vi.mocked(AuthService.me);
const authLogout = vi.mocked(AuthService.logout);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <MemoryRouter initialEntries={['/onboarding']}>
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/settings" element={<div>pagina-settings</div>} />
              <Route path="/dashboard" element={<div>pagina-dashboard</div>} />
              <Route path="/login" element={<div>pagina-login</div>} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </AuthProvider>
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

describe('Onboarding (entrada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    authMe.mockResolvedValue(null);
  });

  it('exibe as três opções e o aviso sobre IA', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderPage();

    expect(await screen.findByTestId('choice-assistant')).toBeInTheDocument();
    expect(screen.getByTestId('choice-manual')).toBeInTheDocument();
    expect(screen.getByTestId('choice-later')).toBeInTheDocument();
    expect(screen.getByText(/pode cometer erros/i)).toBeInTheDocument();
  });

  it('"configurar manualmente" chama skip e navega para as parametrizações', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    skip.mockResolvedValue(statusResponse('SKIPPED'));
    renderPage();

    fireEvent.click(await screen.findByTestId('choice-manual'));

    await waitFor(() => expect(skip).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('pagina-settings')).toBeInTheDocument();
  });

  it('"responder depois" marca a sessão e vai para o dashboard', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderPage();

    fireEvent.click(await screen.findByTestId('choice-later'));

    expect(sessionStorage.getItem('onboardingDeferred')).toBe('1');
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('onboarding concluído redireciona para o dashboard', async () => {
    getStatus.mockResolvedValue(statusResponse('COMPLETED'));
    renderPage();
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
  });

  it('erro ao carregar status mostra retry', async () => {
    getStatus.mockRejectedValue(new Error('falhou'));
    renderPage();
    expect(await screen.findByText(/status da configuração/i)).toBeInTheDocument();
  });

  it('pergunta o idioma antes de apresentar as opções, com Português selecionado por padrão', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderPage();

    expect(await screen.findByTestId('onboarding-language-step')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-language-pt')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('onboarding-language-en')).toHaveAttribute('aria-pressed', 'false');
  });

  it('trocar o idioma reflete na configuração global (persistida) do sistema', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    renderPage();

    fireEvent.click(await screen.findByTestId('onboarding-language-en'));

    await waitFor(() => expect(localStorage.getItem('language')).toBe('en'));
    expect(screen.getByTestId('onboarding-language-en')).toHaveAttribute('aria-pressed', 'true');
  });

  it('permite sair da conta sem completar o onboarding', async () => {
    getStatus.mockResolvedValue(statusResponse('PENDING'));
    authLogout.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByTestId('onboarding-logout'));

    await waitFor(() => expect(authLogout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('pagina-login')).toBeInTheDocument();
  });
});
