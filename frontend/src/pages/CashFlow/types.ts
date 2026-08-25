import { useTranslation } from 'react-i18next';
import { FinancialTransaction, RecurrenceType } from '../../types';

export function useRecurrenceLabels(): Record<RecurrenceType, string> {
  const { t } = useTranslation('cashFlow');
  return {
    UNIQUE: t('recurrence.unique'),
    FIXED: t('recurrence.fixed'),
  };
}

export type ModalKind =
  | { type: 'income'; mode: 'create' | 'edit'; item?: FinancialTransaction }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction };

export type CashFlowTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';
