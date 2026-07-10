import { useTranslation } from 'react-i18next';
import { FinancialTransaction, Receivable, RecurrenceType } from '../../types';

export function useRecurrenceLabels(): Record<RecurrenceType, string> {
  const { t } = useTranslation('cashFlow');
  return {
    UNIQUE: t('recurrence.unique'),
    FIXED: t('recurrence.fixed'),
  };
}

export type ModalKind =
  | { type: 'receivable'; mode: 'create' | 'edit'; item?: Receivable }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction };

export type CashFlowTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';
