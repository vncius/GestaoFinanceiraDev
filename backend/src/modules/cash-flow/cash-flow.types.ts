import { Receivable } from '../receivables/receivables.types';
import { FinancialTransaction } from '../financial-transactions/financial-transactions.types';
import { CreditCardInvoice } from '../credit-cards/credit-cards.types';

export interface CashFlowSummary {
  initialBalance: number;
  projectedInitialBalance: number;
  expectedIncome: number;
  receivedIncome: number;
  expectedPayments: number;
  paidPayments: number;
  expectedExtraExpenses: number;
  paidExtraExpenses: number;
  creditCardInvoices: number;
  paidCreditCardInvoices: number;
  projectedBalance: number;
  realizedBalance: number;
  reserveProjectedInitialBalance: number;
  reserveInflow: number;
  reserveOutflow: number;
  reserveEndBalance: number;
}

export interface CashFlowResponse {
  month: number;
  year: number;
  entries: Receivable[];
  payments: FinancialTransaction[];
  extraExpenses: FinancialTransaction[];
  creditCards: CreditCardInvoice[];
  summary: CashFlowSummary;
}
