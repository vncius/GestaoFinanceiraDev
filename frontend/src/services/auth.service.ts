import { api } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
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

  async logoutAll(): Promise<void> {
    await api.post('/auth/logout-all');
  },
};
