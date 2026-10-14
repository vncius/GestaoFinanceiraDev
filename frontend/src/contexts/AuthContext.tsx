import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthService, AuthUser } from '../services/auth.service';
import { CONSENT_VERSION } from '../config/legal';
import { CONSENT_REQUIRED_EVENT } from '../services/api';

export type LogoutScope = 'device' | 'all';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: (scope?: LogoutScope) => Promise<void>;
  acceptConsent: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    AuthService.me().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // A API recusou por falta de aceite das políticas (mudaram com o app
  // aberto): marca o usuário como pendente para a tela de aceite aparecer.
  useEffect(() => {
    const onConsentRequired = () =>
      setUser((u) => (u && !u.consentRequired ? { ...u, consentRequired: true } : u));
    window.addEventListener(CONSENT_REQUIRED_EVENT, onConsentRequired);
    return () => window.removeEventListener(CONSENT_REQUIRED_EVENT, onConsentRequired);
  }, []);

  // Toda troca de sessão (login com outro usuário, ou logout) precisa limpar
  // o cache do TanStack Query — senão a tela continua mostrando, por um
  // instante, os dados em memória do tenant anterior antes do refetch.
  async function loginWithGoogle(idToken: string) {
    const u = await AuthService.loginWithGoogle(idToken);
    queryClient.clear();
    setUser(u);
  }

  async function acceptConsent() {
    setUser(await AuthService.acceptConsent(CONSENT_VERSION));
  }

  // Exclusão da conta (LGPD): o backend já encerrou todas as sessões.
  async function deleteAccount() {
    await AuthService.deleteAccount();
    if (user) localStorage.removeItem(`activeAccountId:${user.tenantId}`);
    queryClient.clear();
    setUser(null);
  }

  async function logout(scope: LogoutScope = 'device') {
    if (user) localStorage.removeItem(`activeAccountId:${user.tenantId}`);
    if (scope === 'all') await AuthService.logoutAll();
    else await AuthService.logout();
    queryClient.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, acceptConsent, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
