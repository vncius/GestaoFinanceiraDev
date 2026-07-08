import { FinancialTransaction, Receivable, RecurrenceType } from '../../types';

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  UNIQUE: 'Único',
  FIXED: 'Fixo (recorrente)',
};

export type ModalKind =
  | { type: 'receivable'; mode: 'create' | 'edit'; item?: Receivable }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction };

export type CashFlowTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';
