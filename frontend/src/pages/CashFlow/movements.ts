import { CreditCardInvoice, FinancialTransaction, TransferFlowItem } from '../../types';

// Lista única de Movimentações (U10 do plano de UX, D8): entradas, pagamentos,
// gastos fora do comum, transferências e faturas viram um único tipo de linha,
// agrupado por situação. Os tipos internos continuam os mesmos (D6) — cada
// item guarda a origem para despachar ações para o handler certo.

export type MovementKind = 'income' | 'payment' | 'extra' | 'transfer' | 'invoice';

export type MovementSource =
  | { kind: 'income' | 'payment' | 'extra'; item: FinancialTransaction }
  | { kind: 'transfer'; item: TransferFlowItem }
  | { kind: 'invoice'; item: CreditCardInvoice };

export interface MovementItem {
  key: string;
  kind: MovementKind;
  // Entrada soma, saída subtrai. Transferência tem sentido (entra/sai da
  // conta), mas é exibida em tom neutro: não é ganho nem gasto (D2).
  direction: 'in' | 'out';
  description: string;
  amount: number;
  date: string;
  settled: boolean;
  categoryId: string | null;
  isFixed: boolean;
  isAutoReserve: boolean;
  counterpartAccountName: string | null;
  // Id usado pelas mutations (transferência usa o transferGroupId).
  actionId: string;
  source: MovementSource;
}

export interface MovementsInput {
  entries: FinancialTransaction[];
  payments: FinancialTransaction[];
  extraExpenses: FinancialTransaction[];
  transfers: TransferFlowItem[];
  creditCards: CreditCardInvoice[];
  cardNames: Map<string, string>;
  cardFallbackName: string;
}

function fromTransaction(kind: 'income' | 'payment' | 'extra', t: FinancialTransaction): MovementItem {
  return {
    key: `${kind}:${t.id}`,
    kind,
    direction: kind === 'income' ? 'in' : 'out',
    description: t.description,
    amount: t.amount,
    date: t.expectedDate,
    settled: t.status === 'PAID' || t.status === 'RECEIVED',
    categoryId: t.categoryId,
    isFixed: t.recurrence === 'FIXED',
    isAutoReserve: false,
    counterpartAccountName: null,
    actionId: t.id,
    source: { kind, item: t },
  };
}

export function toMovements(input: MovementsInput): MovementItem[] {
  const transfers: MovementItem[] = input.transfers.map((t) => ({
    key: `transfer:${t.id}`,
    kind: 'transfer',
    direction: t.direction === 'IN' ? 'in' : 'out',
    description: t.description,
    amount: t.amount,
    date: t.expectedDate,
    settled: t.status === 'PAID' || t.status === 'RECEIVED',
    categoryId: null,
    isFixed: false,
    isAutoReserve: t.isAutoReserve,
    counterpartAccountName: t.counterpartAccountName,
    actionId: t.transferGroupId,
    source: { kind: 'transfer', item: t },
  }));

  // Fatura sem nenhum lançamento (total 0, ainda não paga) não é algo a pagar.
  const invoices: MovementItem[] = input.creditCards
    .filter((inv) => inv.totalAmount > 0 || inv.status === 'PAID')
    .map((inv) => ({
      key: `invoice:${inv.id}`,
      kind: 'invoice',
      direction: 'out',
      description: input.cardNames.get(inv.creditCardId) ?? input.cardFallbackName,
      amount: inv.totalAmount,
      date: inv.dueDate,
      settled: inv.status === 'PAID',
      categoryId: null,
      isFixed: false,
      isAutoReserve: false,
      counterpartAccountName: null,
      actionId: inv.id,
      source: { kind: 'invoice', item: inv },
    }));

  return [
    ...input.entries.map((t) => fromTransaction('income', t)),
    ...input.payments.map((t) => fromTransaction('payment', t)),
    ...input.extraExpenses.map((t) => fromTransaction('extra', t)),
    ...transfers,
    ...invoices,
  ];
}

export interface MovementGroups {
  overdue: MovementItem[];
  upcoming: MovementItem[];
  done: MovementItem[];
}

const dayKey = (iso: string) => iso.slice(0, 10);

export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Atrasados (pendente com data antes de hoje) → A vencer → Concluídos (D8).
// Dentro de cada grupo, por data e depois por descrição, para a ordem ser
// estável entre renders.
export function groupBySituation(items: MovementItem[], todayKey: string = localDayKey()): MovementGroups {
  const byDate = (a: MovementItem, b: MovementItem) =>
    dayKey(a.date).localeCompare(dayKey(b.date)) || a.description.localeCompare(b.description);
  const pending = items.filter((i) => !i.settled);
  return {
    overdue: pending.filter((i) => dayKey(i.date) < todayKey).sort(byDate),
    upcoming: pending.filter((i) => dayKey(i.date) >= todayKey).sort(byDate),
    done: items.filter((i) => i.settled).sort(byDate),
  };
}
