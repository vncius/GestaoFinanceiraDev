export enum TransactionType {
  INCOME = 'INCOME',
  PAYMENT = 'PAYMENT',
  EXTRA_EXPENSE = 'EXTRA_EXPENSE',
  CREDIT_CARD_PAYMENT = 'CREDIT_CARD_PAYMENT',
  RESERVE = 'RESERVE',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  RECEIVED = 'RECEIVED',
  CANCELED = 'CANCELED',
  REVERSED = 'REVERSED',
}

export enum OriginType {
  RECEIVABLE = 'RECEIVABLE',
  PAYMENT = 'PAYMENT',
  EXTRA_EXPENSE = 'EXTRA_EXPENSE',
  CREDIT_CARD_INVOICE = 'CREDIT_CARD_INVOICE',
}

export interface FinancialTransaction {
  id: string;
  type: TransactionType;
  description: string;
  categoryId: string | null;
  amount: number;               // centavos
  expectedDate: string;         // ISO
  actualDate: string | null;    // ISO — preenchido ao pagar/receber
  status: TransactionStatus;
  sourceAccountId: string | null;
  targetAccountId: string | null;
  originType: OriginType | null;
  originId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
