import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ?? 'Erro ao conectar com o servidor';
    return Promise.reject(new Error(message));
  },
);
