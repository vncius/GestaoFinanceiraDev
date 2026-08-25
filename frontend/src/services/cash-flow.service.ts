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

export interface CreateIncomePayload {
  description: string;
  categoryId: string;
  amount: number;
  expectedDate: string;
  targetAccountId?: string | null;
  notes?: string | null;
  recurrence?: RecurrenceType;
}

export interface PayTransactionPayload {
  actualDate?: string;
  amountPaid?: number;
}

export interface ReceiveIncomePayload {
  actualDate?: string;
  amountReceived?: number;
}

export interface DeleteScopeParams {
  scope: 'CURRENT' | 'CURRENT_AND_FUTURE';
  month: number;
  year: number;
}

export const CashFlowService = {
  get: (month: number, year: number, accountId: string): Promise<CashFlowResponse> =>
    api.get<CashFlowResponse>('/cash-flow', { params: { month, year, accountId } }).then((r) => r.data),

  // Income
  createIncome: (accountId: string, payload: CreateIncomePayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>('/cash-flow/income', payload, { params: { accountId } }).then((r) => r.data),

  updateIncome: (id: string, payload: Partial<CreateIncomePayload>, scopeParams?: DeleteScopeParams): Promise<FinancialTransaction> =>
    api.put<FinancialTransaction>(`/cash-flow/income/${id}`, payload, { params: scopeParams }).then((r) => r.data),

  deleteIncome: (id: string, scopeParams?: DeleteScopeParams): Promise<void> =>
    api.delete(`/cash-flow/income/${id}`, { params: scopeParams }).then(() => undefined),

  receiveIncome: (id: string, payload?: ReceiveIncomePayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/income/${id}/receive`, payload ?? {}).then((r) => r.data),

  revertIncome: (id: string): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/income/${id}/revert`).then((r) => r.data),

  // Payments
  createPayment: (accountId: string, payload: CreateTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>('/cash-flow/payments', payload, { params: { accountId } }).then((r) => r.data),

  updatePayment: (id: string, payload: Partial<CreateTransactionPayload>, scopeParams?: DeleteScopeParams): Promise<FinancialTransaction> =>
    api.put<FinancialTransaction>(`/cash-flow/payments/${id}`, payload, { params: scopeParams }).then((r) => r.data),

  deletePayment: (id: string, scopeParams?: DeleteScopeParams): Promise<void> =>
    api.delete(`/cash-flow/payments/${id}`, { params: scopeParams }).then(() => undefined),

  payPayment: (id: string, payload?: PayTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/payments/${id}/pay`, payload ?? {}).then((r) => r.data),

  revertPayment: (id: string): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/payments/${id}/revert`).then((r) => r.data),

  // Extra expenses
  createExtraExpense: (accountId: string, payload: CreateTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>('/cash-flow/extra-expenses', payload, { params: { accountId } }).then((r) => r.data),

  updateExtraExpense: (id: string, payload: Partial<CreateTransactionPayload>, scopeParams?: DeleteScopeParams): Promise<FinancialTransaction> =>
    api.put<FinancialTransaction>(`/cash-flow/extra-expenses/${id}`, payload, { params: scopeParams }).then((r) => r.data),

  deleteExtraExpense: (id: string, scopeParams?: DeleteScopeParams): Promise<void> =>
    api.delete(`/cash-flow/extra-expenses/${id}`, { params: scopeParams }).then(() => undefined),

  payExtraExpense: (id: string, payload?: PayTransactionPayload): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/extra-expenses/${id}/pay`, payload ?? {}).then((r) => r.data),

  revertExtraExpense: (id: string): Promise<FinancialTransaction> =>
    api.post<FinancialTransaction>(`/cash-flow/extra-expenses/${id}/revert`).then((r) => r.data),
};
