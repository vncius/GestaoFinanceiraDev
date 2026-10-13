import { describe, expect, it } from 'vitest';
import { CashFlowSummary } from '../types';
import { projectionRange, summarizeMonth } from './month-summary';

// Resumo coerente com o backend: realizedBalance e projectedBalance já vêm
// fechados a partir das parcelas abaixo.
const summary: CashFlowSummary = {
  initialBalance: 100000,
  projectedInitialBalance: 145000,
  receivedIncome: 80000,
  expectedIncome: 20000,
  paidPayments: 30000,
  expectedPayments: 15000,
  paidExtraExpenses: 5000,
  expectedExtraExpenses: 0,
  paidCreditCardInvoices: 10000,
  creditCardInvoices: 12000,
  pendingIncome: 20000,
  pendingIncomeCount: 1,
  pendingExpenses: 27000,
  pendingExpensesCount: 2,
  transferInflow: 25000,
  transferOutflow: 15000,
  expectedTransferInflow: 0,
  expectedTransferOutflow: 3000,
  realizedBalance: 100000 + 80000 + 25000 - 30000 - 5000 - 10000 - 15000,
  projectedBalance: 145000 + 20000 - 15000 - 0 - 12000 + 0 - 3000,
};

describe('summarizeMonth', () => {
  it('deixa transferências fora de entradas e saídas', () => {
    const v = summarizeMonth(summary);
    expect(v.income).toBe(80000);
    expect(v.expenses).toBe(45000);
    expect(v.betweenAccounts).toBe(10000);
  });

  it('fecha o saldo realizado: inicial + entradas − saídas + entre contas', () => {
    const v = summarizeMonth(summary);
    expect(v.initialBalance + v.income - v.expenses + v.betweenAccounts).toBe(v.balance);
  });

  it('fecha a projeção: base + previstos', () => {
    const v = summarizeMonth(summary);
    expect(v.projectedBase + v.expectedIncome - v.expectedExpenses + v.expectedBetweenAccounts).toBe(
      v.projectedBalance,
    );
  });

  it('repassa os pendentes do mês sem acumular', () => {
    const v = summarizeMonth(summary);
    expect(v.pendingIncome).toBe(20000);
    expect(v.pendingExpenses).toBe(27000);
    expect(v.pendingExpensesCount).toBe(2);
  });
});

describe('projectionRange', () => {
  const today = new Date(2026, 9, 13); // 13/10/2026

  it('é null no mês atual e em meses passados', () => {
    expect(projectionRange(10, 2026, today)).toBeNull();
    expect(projectionRange(9, 2026, today)).toBeNull();
    expect(projectionRange(12, 2025, today)).toBeNull();
  });

  it('em mês futuro vai do mês atual ao selecionado, inclusive virando o ano', () => {
    expect(projectionRange(2, 2027, today)).toEqual({ from: { month: 10, year: 2026 }, to: { month: 2, year: 2027 } });
  });
});
