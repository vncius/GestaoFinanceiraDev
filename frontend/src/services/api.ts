import axios from 'axios';
import i18n from '../i18n';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3100',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // Exigido pelo backend em toda requisição que altera dados (proteção
    // CSRF — ver backend/src/shared/middlewares/csrf.middleware.ts).
    'X-Requested-With': 'XMLHttpRequest',
  },
});

function translateErrorCode(code: string, params?: Record<string, string | number>): string {
  const key = `errors:${code}`;
  if (i18n.exists(key)) return i18n.t(key, params);
  return i18n.t('errors:common.unknown');
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    const code = error.response?.data?.code;
    // Políticas mudaram (ou o aceite ainda não foi feito) com o app aberto:
    // recarregar faz o /auth/me trazer consentRequired e mostra a tela de aceite.
    if (error.response?.status === 403 && code === 'auth.consentRequired') {
      window.location.href = '/';
    }
    const params = error.response?.data?.params;
    const message = code
      ? translateErrorCode(code, params)
      : i18n.t('errors:common.networkError');
    return Promise.reject(new Error(message));
  },
);
