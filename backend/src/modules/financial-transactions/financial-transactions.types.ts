import { RecurrenceType } from '../../shared/types/recurrence.types';

export { RecurrenceType };

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
  TRANSFER = 'TRANSFER',
}

export interface FinancialTransaction {
  id: string;
  tenantId: string;
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
  // Liga as duas pernas (saída/entrada) de uma transferência (D5); null para
  // os demais tipos. Estável independente do originType (TRANSFER manual,
  // AUTO_RESERVE automática — E8), diferente de originId.
  transferGroupId: string | null;
  notes: string | null;
  recurrence: RecurrenceType;
  // id do registro raiz da série (== o próprio id quando é o primeiro); null quando UNIQUE
  recurringGroupId: string | null;
  // false quando o usuário encerrou a série ("esta e as futuras"); só relevante para FIXED
  recurringActive: boolean;
  createdAt: string;
  updatedAt: string;
}
