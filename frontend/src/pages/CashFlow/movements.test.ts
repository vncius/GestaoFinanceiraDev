import { describe, expect, it } from 'vitest';
import { filterMovements, groupBySituation, toMovements } from './movements';
import { CreditCardInvoice, FinancialTransaction, TransferFlowItem } from '../../types';

function tx(id: string, date: string, status: FinancialTransaction['status'], extra: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id, type: 'PAYMENT', description: id, categoryId: 'cat', amount: 1000, expectedDate: `${date}T12:00:00.000Z`,
    actualDate: null, status, sourceAccountId: 'a', targetAccountId: null, originType: null, originId: null,
    notes: null, recurrence: 'UNIQUE', recurringGroupId: null, recurringActive: true, createdAt: '', updatedAt: '',
    ...extra,
  } as FinancialTransaction;
}

const transfer: TransferFlowItem = {
  id: 't1', transferGroupId: 'g1', direction: 'OUT', description: 'Para reserva', amount: 500,
  expectedDate: '2026-10-02T12:00:00.000Z', actualDate: null, status: 'PAID', notes: null,
  counterpartAccountId: 'b', counterpartAccountName: 'Reserva', isAutoReserve: true,
};

const invoice = (id: string, total: number, status: CreditCardInvoice['status']): CreditCardInvoice => ({
  id, creditCardId: 'card', month: 10, year: 2026, dueDate: '2026-10-15T12:00:00.000Z', totalAmount: total,
  status, paymentDate: null, paymentAccountId: null, createdAt: '', updatedAt: '',
});

describe('toMovements', () => {
  const items = toMovements({
    entries: [tx('Salário', '2026-10-05', 'RECEIVED', { type: 'INCOME' })],
    payments: [tx('Aluguel', '2026-10-10', 'PENDING', { recurrence: 'FIXED' })],
    extraExpenses: [tx('Conserto', '2026-10-20', 'PENDING', { type: 'EXTRA_EXPENSE' })],
    transfers: [transfer],
    creditCards: [invoice('i1', 30000, 'OPEN'), invoice('vazia', 0, 'OPEN')],
    cardNames: new Map([['card', 'Nubank']]),
    cardFallbackName: 'Cartão',
  });

  it('une os cinco tipos com sentido e marcadores', () => {
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey['income:Salário']).toMatchObject({ direction: 'in', settled: true });
    expect(byKey['payment:Aluguel']).toMatchObject({ direction: 'out', isFixed: true, settled: false });
    expect(byKey['extra:Conserto'].kind).toBe('extra');
    expect(byKey['transfer:t1']).toMatchObject({ direction: 'out', actionId: 'g1', isAutoReserve: true, counterpartAccountName: 'Reserva' });
    expect(byKey['invoice:i1']).toMatchObject({ description: 'Nubank', amount: 30000, settled: false });
  });

  it('ignora fatura vazia ainda não paga', () => {
    expect(items.some((i) => i.key === 'invoice:vazia')).toBe(false);
  });
});

describe('groupBySituation', () => {
  it('separa atrasados, a vencer e concluídos, cada grupo por data', () => {
    const items = toMovements({
      entries: [],
      payments: [
        tx('C', '2026-10-25', 'PENDING'),
        tx('A', '2026-10-01', 'PENDING'),
        tx('Hoje', '2026-10-13', 'PENDING'),
        tx('Pago', '2026-10-03', 'PAID'),
      ],
      extraExpenses: [],
      transfers: [],
      creditCards: [],
      cardNames: new Map(),
      cardFallbackName: '',
    });
    const g = groupBySituation(items, '2026-10-13');
    expect(g.overdue.map((i) => i.description)).toEqual(['A']);
    expect(g.upcoming.map((i) => i.description)).toEqual(['Hoje', 'C']);
    expect(g.done.map((i) => i.description)).toEqual(['Pago']);
  });
});

describe('filterMovements', () => {
  const items = toMovements({
    entries: [tx('Salário', '2026-10-05', 'PENDING', { type: 'INCOME', categoryId: 'renda' })],
    payments: [tx('Aluguél', '2026-10-10', 'PENDING', { recurrence: 'FIXED', categoryId: 'moradia' })],
    extraExpenses: [tx('Conserto', '2026-10-20', 'PENDING', { type: 'EXTRA_EXPENSE' })],
    transfers: [transfer],
    creditCards: [invoice('i1', 30000, 'OPEN')],
    cardNames: new Map([['card', 'Nubank']]),
    cardFallbackName: 'Cartão',
  });
  const categoryNames = new Map([['moradia', 'Moradia'], ['renda', 'Rendimento']]);
  const names = (opts: { search?: string; tags?: string[] }) =>
    filterMovements(items, { search: opts.search ?? '', tags: new Set(opts.tags ?? []) as never, categoryNames }).map((i) => i.description);

  it('sem busca nem tipo, devolve tudo', () => {
    expect(names({})).toHaveLength(5);
  });

  it('busca ignora acento e caixa e também olha categoria e conta da transferência', () => {
    expect(names({ search: 'ALUGUEL' })).toEqual(['Aluguél']);
    expect(names({ search: 'moradia' })).toEqual(['Aluguél']);
    expect(names({ search: 'reserva' })).toEqual(['Para reserva']);
  });

  it('tipos marcados mostram só os itens que têm algum deles', () => {
    expect(names({ tags: ['fixed'] })).toEqual(['Aluguél']);
    expect(names({ tags: ['extra', 'invoice'] }).sort()).toEqual(['Conserto', 'Nubank']);
  });

  it('busca e tipo combinam', () => {
    expect(names({ search: 'conserto', tags: ['fixed'] })).toEqual([]);
  });
});
