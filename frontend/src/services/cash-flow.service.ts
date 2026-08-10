import { api } from './api';
import { CashFlowResponse, FinancialTransaction, RecurrenceType } from '../types';

export interface CreateTransactionPayload {
  description: string;
  categoryId: string;
  amount: number;
  expectedDate: string;
  sourceAccountId?: string | null;
  notes?: string | null;
  recurrence?: RecurrenceType;
}

export interface PayTransactionPayload {
  actualDate?: string;
  amountPaid?: number;
}

export interface DeleteScopeParams {
  scope: 'CURRENT' | 'CURRENT_AND_FUTURE';
  month: number;
  year: number;
}

export const CashFlowService = {
  get: (month: number, year: number): Promise<CashFlowResponse> =>
    api.get<CashFlowResponse>('/cash-flow', { params: { month, year } }).then((r) => r.data),

  // Payments
  createPayment: (payload: CreateTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>('/cash-flow/payments', payload).then((r) => r.data),

  updatePayment: (id: string, payload: Partial<CreateTransactionPayload>, scopeParams?: DeleteScopeParams): Promise<FinancialTransaction> =>
    api.put<FinancialTransaction>(`/cash-flow/payments/${id}`, payload, { params: scopeParams }).then((r) => r.data),

  deletePayment: (id: string, scopeParams?: DeleteScopeParams): Promise<void> =>
    api.delete(`/cash-flow/payments/${id}`, { params: scopeParams }).then(() => undefined),

  payPayment: (id: string, payload?: PayTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/payments/${id}/pay`, payload ?? {}).then((r) => r.data),

  revertPayment: (id: string): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/payments/${id}/revert`).then((r) => r.data),

  // Extra expenses
  createExtraExpense: (payload: CreateTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>('/cash-flow/extra-expenses', payload).then((r) => r.data),

  updateExtraExpense: (id: string, payload: Partial<CreateTransactionPayload>, scopeParams?: DeleteScopeParams): Promise<FinancialTransaction> =>
    api.put<FinancialTransaction>(`/cash-flow/extra-expenses/${id}`, payload, { params: scopeParams }).then((r) => r.data),

  deleteExtraExpense: (id: string, scopeParams?: DeleteScopeParams): Promise<void> =>
    api.delete(`/cash-flow/extra-expenses/${id}`, { params: scopeParams }).then(() => undefined),

  payExtraExpense: (id: string, payload?: PayTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/extra-expenses/${id}/pay`, payload ?? {}).then((r) => r.data),

  revertExtraExpense: (id: string): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/extra-expenses/${id}/revert`).then((r) => r.data),
};
