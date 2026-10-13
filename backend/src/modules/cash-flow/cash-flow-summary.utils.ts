import { CashFlowSummary } from './cash-flow.types';

export const ZERO_SUMMARY: CashFlowSummary = {
  initialBalance: 0,
  projectedInitialBalance: 0,
  expectedIncome: 0,
  receivedIncome: 0,
  expectedPayments: 0,
  paidPayments: 0,
  expectedExtraExpenses: 0,
  paidExtraExpenses: 0,
  creditCardInvoices: 0,
  paidCreditCardInvoices: 0,
  pendingIncome: 0,
  pendingIncomeCount: 0,
  pendingExpenses: 0,
  pendingExpensesCount: 0,
  transferInflow: 0,
  expectedTransferInflow: 0,
  transferOutflow: 0,
  expectedTransferOutflow: 0,
  projectedBalance: 0,
  realizedBalance: 0,
};

// Todos os campos do resumo são aditivos; somar pelas chaves de ZERO_SUMMARY
// evita esquecer um campo novo no consolidado (dashboard e Movimentações).
export function sumSummaries(a: CashFlowSummary, b: CashFlowSummary): CashFlowSummary {
  const out = { ...ZERO_SUMMARY };
  for (const key of Object.keys(ZERO_SUMMARY) as (keyof CashFlowSummary)[]) {
    out[key] = a[key] + b[key];
  }
  return out;
}
