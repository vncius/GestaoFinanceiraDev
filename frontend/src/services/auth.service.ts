import { api } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  /** true enquanto não aceitou a versão vigente das políticas (LGPD). */
  consentRequired: boolean;
}

export const AuthService = {
  async loginWithGoogle(idToken: string): Promise<AuthUser> {
    const { data } = await api.post('/auth/google', { idToken });
    return data.user;
  },

  async me(): Promise<AuthUser | null> {
    try {
      const { data } = await api.get('/auth/me');
      return data.user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async acceptConsent(version: number): Promise<AuthUser> {
    const { data } = await api.post('/auth/consent', { accept: true, version });
    return data.user;
  },

  async deleteAccount(): Promise<void> {
    await api.delete('/auth/account', { data: { confirm: true } });
  },

  async logoutAll(): Promise<void> {
    await api.post('/auth/logout-all');
  },
};
