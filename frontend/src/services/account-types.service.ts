import { api } from './api';
import { AccountTypeItem } from '../types';

export interface CreateAccountTypePayload {
  name: string;
}

export const AccountTypesService = {
  findAll: (): Promise<AccountTypeItem[]> =>
    api.get<AccountTypeItem[]>('/account-types').then((r) => r.data),

  create: (payload: CreateAccountTypePayload): Promise<AccountTypeItem> =>
    api.post<AccountTypeItem>('/account-types', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateAccountTypePayload>): Promise<AccountTypeItem> =>
    api.put<AccountTypeItem>(`/account-types/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/account-types/${id}`).then(() => undefined),
};
