import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider } from '../../contexts/AuthContext';
import { AuthService, AuthUser } from '../../services/auth.service';
import { CONSENT_VERSION } from '../../config/legal';

vi.mock('../../services/auth.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/auth.service')>();
  return {
    ...original,
    AuthService: {
      me: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      logoutAll: vi.fn(),
      acceptConsent: vi.fn(),
    },
  };
});

const me = vi.mocked(AuthService.me);
const acceptConsent = vi.mocked(AuthService.acceptConsent);
const logout = vi.mocked(AuthService.logout);

const user: AuthUser = { id: 'u1', email: 'a@b.com', name: 'A', tenantId: 't1', consentRequired: true };

function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<div>conteudo-do-app</div>} />
            </Route>
            <Route path="/login" element={<div>pagina-login</div>} />
            <Route path="/privacy" element={<div>politica</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute — consentimento LGPD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a tela de aceite antes do app quando falta consentimento', async () => {
    me.mockResolvedValue(user);
    renderApp();
    expect(await screen.findByTestId('consent-screen')).toBeInTheDocument();
    expect(screen.queryByText('conteudo-do-app')).not.toBeInTheDocument();
  });

  it('só libera o botão de aceitar depois de marcar a caixa, e aceita a versão vigente', async () => {
    me.mockResolvedValue(user);
    acceptConsent.mockResolvedValue({ ...user, consentRequired: false });
    renderApp();

    const accept = await screen.findByTestId('consent-accept');
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    expect(accept).not.toBeDisabled();
    fireEvent.click(accept);

    expect(await screen.findByText('conteudo-do-app')).toBeInTheDocument();
    expect(acceptConsent).toHaveBeenCalledWith(CONSENT_VERSION);
  });

  it('recusar sai da conta', async () => {
    me.mockResolvedValue(user);
    logout.mockResolvedValue(undefined);
    renderApp();

    fireEvent.click(await screen.findByText(/Não aceito|I do not accept|No acepto/));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await screen.findByText('pagina-login')).toBeInTheDocument();
  });

  it('com consentimento em dia vai direto para o app', async () => {
    me.mockResolvedValue({ ...user, consentRequired: false });
    renderApp();
    expect(await screen.findByText('conteudo-do-app')).toBeInTheDocument();
  });
});
