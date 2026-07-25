export enum CardEntryType {
  CASH = 'CASH',
  FIXED = 'FIXED',
  INSTALLMENT = 'INSTALLMENT',
  REFUND = 'REFUND',
}

export enum InstallmentStatus {
  OPEN = 'OPEN',
  PAID = 'PAID',
  CANCELED = 'CANCELED',
}

export enum InvoiceStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELED = 'CANCELED',
}

export interface CreditCard {
  id: string;
  tenantId: string;
  name: string;
  bank: string;
  closingDay: number;                    // dia do fechamento (1–28)
  dueDay: number;                        // dia do vencimento (1–28)
  limit: number;                         // centavos
  defaultPaymentAccountId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardEntry {
  id: string;
  tenantId: string;
  creditCardId: string;
  description: string;
  expenseCategoryId: string;
  totalAmount: number;                   // centavos
  purchaseDate: string;                  // ISO
  entryType: CardEntryType;
  installmentsCount: number;             // 1 para à vista/fixo/estorno
  closingDayUsed: number;                // dia de fechamento do cartão vigente na criação/recriação das parcelas
  notes: string | null;
  // FITID do OFX quando o lançamento vier de uma importação de fatura;
  // null para lançamentos digitados manualmente. Usado para deduplicar
  // reimportações do mesmo arquivo/período.
  externalRef: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardInstallment {
  id: string;
  tenantId: string;
  creditCardEntryId: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;                        // centavos
  month: number;                         // 1–12
  year: number;
  status: InstallmentStatus;
  creditCardInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardInvoice {
  id: string;
  tenantId: string;
  creditCardId: string;
  month: number;                         // 1–12
  year: number;
  dueDate: string;                       // ISO
  totalAmount: number;                   // centavos
  status: InvoiceStatus;
  paymentDate: string | null;            // ISO
  paymentAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}
