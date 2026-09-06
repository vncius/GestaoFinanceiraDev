import { api } from './api';
import { FinancialTransaction } from '../types';

export interface CreateTransferPayload {
  sourceAccountId: string;
  targetAccountId: string;
  amount: number;
  date: string;
  description: string;
  notes?: string | null;
}

export interface TransferPair {
  transferGroupId: string;
  outgoing: FinancialTransaction;
  incoming: FinancialTransaction;
}

export const TransfersService = {
  create: (payload: CreateTransferPayload): Promise<TransferPair> =>
    api.post<TransferPair>('/transfers', payload).then((r) => r.data),

  update: (transferGroupId: string, payload: Partial<CreateTransferPayload>): Promise<TransferPair> =>
    api.put<TransferPair>(`/transfers/${transferGroupId}`, payload).then((r) => r.data),

  remove: (transferGroupId: string): Promise<void> =>
    api.delete(`/transfers/${transferGroupId}`).then(() => undefined),

  settle: (transferGroupId: string): Promise<TransferPair> =>
    api.post<TransferPair>(`/transfers/${transferGroupId}/settle`).then((r) => r.data),

  revert: (transferGroupId: string): Promise<TransferPair> =>
    api.post<TransferPair>(`/transfers/${transferGroupId}/revert`).then((r) => r.data),
};
