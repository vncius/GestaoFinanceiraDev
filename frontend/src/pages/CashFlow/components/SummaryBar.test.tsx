import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../../i18n';
import { SummaryBar } from './SummaryBar';
import { CashFlowSummary } from '../../../types';

const base: CashFlowSummary = {
  initialBalance: 100000,
  projectedInitialBalance: 150000,
  receivedIncome: 50000,
  expectedIncome: 0,
  paidPayments: 0,
  expectedPayments: 20000,
  paidExtraExpenses: 0,
  expectedExtraExpenses: 0,
  paidCreditCardInvoices: 0,
  creditCardInvoices: 0,
  pendingIncome: 0,
  pendingIncomeCount: 0,
  pendingExpenses: 20000,
  pendingExpensesCount: 1,
  transferInflow: 0,
  transferOutflow: 0,
  expectedTransferInflow: 0,
  expectedTransferOutflow: 0,
  realizedBalance: 150000,
  projectedBalance: 130000,
};

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();
const future = new Date(currentYear, now.getMonth() + 2, 1);

function renderBar(summary: CashFlowSummary, month = currentMonth, year = currentYear, expanded = true) {
  return render(
    <SummaryBar summary={summary} month={month} year={year} expanded={expanded} onToggleExpanded={() => {}} />,
  );
}

describe('SummaryBar', () => {
  it('mostra o que já aconteceu e o que falta, sem detalhes até pedir', () => {
    renderBar(base, currentMonth, currentYear, false);
    for (const label of ['Entrou', 'Saiu', 'Saldo', 'Falta receber', 'Falta pagar', 'Previsto']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Saldo no início do mês')).toBeNull();
  });

  it('sem transferências no mês, os detalhes não mostram "Entre suas contas"', () => {
    renderBar(base);
    expect(screen.getByText('Saldo no início do mês')).toBeTruthy();
    expect(screen.queryByText('Entre suas contas')).toBeNull();
  });

  it('transferência fica fora de Saiu e aparece em "Entre suas contas"', () => {
    renderBar({ ...base, transferOutflow: 30000, realizedBalance: 120000 });
    expect(screen.getByText('Entre suas contas')).toBeTruthy();
    const saiu = screen.getByText('Saiu').parentElement!;
    expect(saiu.textContent).toContain('0,00');
  });

  it('em mês futuro, avisa que os previstos são acumulados', () => {
    renderBar(base, future.getMonth() + 1, future.getFullYear());
    expect(screen.getByText(/Previstos acumulados de/)).toBeTruthy();
  });

  it('no mês atual não mostra intervalo acumulado', () => {
    renderBar(base);
    expect(screen.queryByText(/Previstos acumulados de/)).toBeNull();
  });
});
