import { api } from './api';
import { InvoiceImportPreviewEntry, InvoiceImportInstallmentInfo } from '../types';

export interface ConfirmInvoiceImportEntry {
  date: string;
  description: string;
  amountCents: number;
  entryType: 'CASH' | 'INSTALLMENT' | 'REFUND';
  categoryId: string;
  createFutureInstallments: boolean;
  installmentInfo?: InvoiceImportInstallmentInfo | null;
  externalRef?: string | null;
  overwriteEntryId?: string | null;
}

export const CreditCardInvoiceImportService = {
  parseInvoice: (
    cardId: string,
    filename: string,
    content: string,
  ): Promise<{ entries: InvoiceImportPreviewEntry[] }> =>
    api.post(`/credit-cards/${cardId}/invoice-import/parse`, { filename, content }).then((r) => r.data),

  confirmImport: (
    cardId: string,
    entries: ConfirmInvoiceImportEntry[],
  ): Promise<{ created: number; updated: number }> =>
    api.post(`/credit-cards/${cardId}/invoice-import/confirm`, { entries }).then((r) => r.data),
};
