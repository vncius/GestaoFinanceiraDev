import { api } from './api';
import { FinancialSettings } from '../types';

export type UpdateSettingsPayload = Partial<
  Omit<FinancialSettings, 'id' | 'createdAt' | 'updatedAt'>
>;

export const SettingsService = {
  get: (): Promise<FinancialSettings> =>
    api.get<FinancialSettings>('/settings').then((r) => r.data),

  update: (payload: UpdateSettingsPayload): Promise<FinancialSettings> =>
    api.put<FinancialSettings>('/settings', payload).then((r) => r.data),
};
