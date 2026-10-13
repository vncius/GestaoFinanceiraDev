import { FinancialTransaction, TransferFlowItem } from '../../types';

export type ModalKind =
  | { type: 'income'; mode: 'create' | 'edit'; item?: FinancialTransaction }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction }
  | { type: 'transfer'; mode: 'create' | 'edit'; item?: TransferFlowItem };

export type CashFlowTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';
