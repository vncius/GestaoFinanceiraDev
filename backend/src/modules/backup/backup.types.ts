import { Account } from '../accounts/accounts.types';
import { Category } from '../categories/categories.types';
import { FinancialSettings } from '../settings/settings.types';
import { FinancialTransaction } from '../financial-transactions/financial-transactions.types';
import {
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
} from '../credit-cards/credit-cards.types';

export const BACKUP_VERSION = 2;

export interface BackupBundle {
  version: number;
  exportedAt: string;
  data: {
    accounts: Account[];
    categories: Category[];
    settings: FinancialSettings[];
    financialTransactions: FinancialTransaction[];
    creditCards: CreditCard[];
    creditCardEntries: CreditCardEntry[];
    creditCardInstallments: CreditCardInstallment[];
    creditCardInvoices: CreditCardInvoice[];
  };
}

export type StatementEntryType = 'INCOME' | 'EXPENSE';

export interface ParsedStatementEntry {
  date: string; // ISO (data only)
  description: string;
  amount: number; // centavos, sempre positivo
  type: StatementEntryType;
  possibleDuplicate: boolean;
  // Saída com cara de pagamento de fatura: a fatura já entra no fluxo pelo
  // cartão, então importar esta linha contaria o mesmo gasto duas vezes.
  possibleInvoicePayment: boolean;
}
