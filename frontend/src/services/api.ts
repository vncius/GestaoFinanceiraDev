import axios from 'axios';
import i18n from '../i18n';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3100',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
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
    const params = error.response?.data?.params;
    const message = code
      ? translateErrorCode(code, params)
      : i18n.t('errors:common.networkError');
    return Promise.reject(new Error(message));
  },
);
