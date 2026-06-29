import { api } from './api';
import {
  CardFlowResponse,
  CreditCard,
  CreditCardEntry,
  CreditCardInvoice,
} from '../types';

export interface CreateCreditCardPayload {
  name: string;
  bank: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  defaultPaymentAccountId?: string | null;
}

export interface CreateCardEntryPayload {
  description: string;
  expenseCategoryId: string;
  totalAmount: number;
  purchaseDate: string;
  entryType: 'CASH' | 'FIXED' | 'INSTALLMENT';
  installmentsCount?: number;
  notes?: string | null;
}

export interface PayInvoicePayload {
  paymentAccountId?: string | null;
  paymentDate?: string;
}

export const CreditCardsService = {
  findAll: (): Promise<CreditCard[]> =>
    api.get<CreditCard[]>('/credit-cards').then((r) => r.data),

  create: (payload: CreateCreditCardPayload): Promise<CreditCard> =>
    api.post<CreditCard>('/credit-cards', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateCreditCardPayload>): Promise<CreditCard> =>
    api.put<CreditCard>(`/credit-cards/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/credit-cards/${id}`).then(() => undefined),

  getFlow: (id: string, month: number, year: number): Promise<CardFlowResponse> =>
    api.get<CardFlowResponse>(`/credit-cards/${id}/flow`, { params: { month, year } }).then((r) => r.data),

  createEntry: (
    cardId: string,
    payload: CreateCardEntryPayload,
  ): Promise<{ entry: CreditCardEntry; installments: unknown[] }> =>
    api.post(`/credit-cards/${cardId}/entries`, payload).then((r) => r.data),

  updateEntry: (
    cardId: string,
    entryId: string,
    payload: { description?: string; expenseCategoryId?: string; notes?: string | null },
  ): Promise<CreditCardEntry> =>
    api.put<CreditCardEntry>(`/credit-cards/${cardId}/entries/${entryId}`, payload).then((r) => r.data),

  deleteEntry: (cardId: string, entryId: string): Promise<void> =>
    api.delete(`/credit-cards/${cardId}/entries/${entryId}`).then(() => undefined),

  payInvoice: (cardId: string, invoiceId: string, payload?: PayInvoicePayload): Promise<CreditCardInvoice> =>
    api.post<CreditCardInvoice>(`/credit-cards/${cardId}/invoices/${invoiceId}/pay`, payload ?? {}).then((r) => r.data),

  revertInvoice: (cardId: string, invoiceId: string): Promise<CreditCardInvoice> =>
    api.post<CreditCardInvoice>(`/credit-cards/${cardId}/invoices/${invoiceId}/revert`).then((r) => r.data),
};
