import { api } from './api';
import { Account } from '../types';

export interface CreateAccountPayload {
  name: string;
  accountTypeId: string | null;
  initialBalance: number;
  autoReserveEnabled: boolean;
  autoReservePercentage: number;
  autoReserveTargetAccountId?: string | null;
}

export const AccountsService = {
  findAll: (): Promise<Account[]> =>
    api.get<Account[]>('/accounts').then((r) => r.data),

  create: (payload: CreateAccountPayload): Promise<Account> =>
    api.post<Account>('/accounts', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateAccountPayload>): Promise<Account> =>
    api.put<Account>(`/accounts/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/accounts/${id}`).then(() => undefined),
};
