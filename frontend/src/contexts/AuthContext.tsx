import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthService, AuthUser } from '../services/auth.service';
import { CONSENT_VERSION } from '../config/legal';

export type LogoutScope = 'device' | 'all';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: (scope?: LogoutScope) => Promise<void>;
  acceptConsent: () => Promise<void>;
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

  async function logout(scope: LogoutScope = 'device') {
    if (user) localStorage.removeItem(`activeAccountId:${user.tenantId}`);
    if (scope === 'all') await AuthService.logoutAll();
    else await AuthService.logout();
    queryClient.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, acceptConsent }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
