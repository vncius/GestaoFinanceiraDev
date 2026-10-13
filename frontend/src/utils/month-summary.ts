import { CashFlowSummary } from '../types';

// Regra única de leitura do resumo mensal (D2 do plano de simplificação de UX),
// usada por Dashboard, Fluxo de Caixa e Relatório para que os mesmos rótulos
// mostrem sempre os mesmos números.
//
// Transferência não é ganho nem gasto: fica fora de Entradas/Saídas e aparece
// à parte, como saldo líquido "entre suas contas". Os dois fechamentos valem
// sempre:
//   initialBalance + income − expenses + betweenAccounts === balance
//   projectedBase + expectedIncome − expectedExpenses + expectedBetweenAccounts === projectedBalance
export interface MonthSummaryView {
  initialBalance: number;
  income: number;
  expenses: number;
  betweenAccounts: number;
  balance: number;

  // Só o mês selecionado (nunca acumulado).
  pendingIncome: number;
  pendingIncomeCount: number;
  pendingExpenses: number;
  pendingExpensesCount: number;

  // Projeção: em mês futuro os expected* acumulam desde o mês atual.
  projectedBase: number;
  expectedIncome: number;
  expectedExpenses: number;
  expectedBetweenAccounts: number;
  projectedBalance: number;
}

export function summarizeMonth(s: CashFlowSummary): MonthSummaryView {
  return {
    initialBalance: s.initialBalance,
    income: s.receivedIncome,
    expenses: s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices,
    betweenAccounts: s.transferInflow - s.transferOutflow,
    balance: s.realizedBalance,

    pendingIncome: s.pendingIncome,
    pendingIncomeCount: s.pendingIncomeCount,
    pendingExpenses: s.pendingExpenses,
    pendingExpensesCount: s.pendingExpensesCount,

    projectedBase: s.projectedInitialBalance,
    expectedIncome: s.expectedIncome,
    expectedExpenses: s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices,
    expectedBetweenAccounts: s.expectedTransferInflow - s.expectedTransferOutflow,
    projectedBalance: s.projectedBalance,
  };
}

export interface MonthRef {
  month: number;
  year: number;
}

// Em mês futuro, os previstos (expected*/projectedBalance) acumulam desde o
// mês atual até o selecionado — o rótulo precisa dizer o intervalo. Mês
// atual ou passado: null (o previsto é só do próprio mês).
export function projectionRange(month: number, year: number, today: Date = new Date()): { from: MonthRef; to: MonthRef } | null {
  const current = { month: today.getMonth() + 1, year: today.getFullYear() };
  const isFuture = year > current.year || (year === current.year && month > current.month);
  return isFuture ? { from: current, to: { month, year } } : null;
}
