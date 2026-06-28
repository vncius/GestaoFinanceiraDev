import { api } from './api';

export async function checkHealth(): Promise<{ status: string }> {
  const response = await api.get<{ status: string }>('/health');
  return response.data;
}
