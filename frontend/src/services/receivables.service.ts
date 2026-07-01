import { api } from './api';
import { Receivable } from '../types';

export interface CreateReceivablePayload {
  description: string;
  expectedPaymentDate: string;
  grossAmount: number;
  separateReservePercentage: boolean;
  incomeCategoryId: string;
  notes?: string | null;
  customerName?: string | null;
  invoiceNumber?: string | null;
  invoiceCode?: string | null;
  invoiceLink?: string | null;
  invoiceIssueDate?: string | null;
  competence?: string | null;
  workedHours?: number | null;
  targetAccountId?: string | null;
}

export interface ReceivePayload {
  actualPaymentDate?: string;
}

export const ReceivablesService = {
  findAll: (): Promise<Receivable[]> =>
    api.get<Receivable[]>('/receivables').then((r) => r.data),

  findByMonth: (month: number, year: number): Promise<Receivable[]> =>
    api.get<Receivable[]>('/receivables', { params: { month, year } }).then((r) => r.data),

  create: (payload: CreateReceivablePayload): Promise<Receivable> =>
    api.post<Receivable>('/receivables', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateReceivablePayload>): Promise<Receivable> =>
    api.put<Receivable>(`/receivables/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/receivables/${id}`).then(() => undefined),

  receive: (id: string, payload?: ReceivePayload): Promise<Receivable> =>
    api.post<Receivable>(`/receivables/${id}/receive`, payload ?? {}).then((r) => r.data),

  revert: (id: string): Promise<Receivable> =>
    api.post<Receivable>(`/receivables/${id}/revert`).then((r) => r.data),
};
