import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { ReportsService } from './reports.service';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  FinancialTransaction,
  OriginType,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { Account } from '../accounts/accounts.types';
import { Category, CategoryType } from '../categories/categories.types';
import {
  CardEntryType,
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
  InstallmentStatus,
  InvoiceStatus,
} from '../credit-cards/credit-cards.types';

const TENANT_ID = 'test-tenant-1';
// Referência no passado: o "previsto" não acumula meses futuros.
const MONTH = 3;
const YEAR = 2026;
const NOW = new Date().toISOString();

class Repo<T extends { id: string; tenantId: string }> {
  items: T[] = [];
  async findAll(tenantId: string) { return this.items.filter((i) => i.tenantId === tenantId); }
  async findById(id: string, tenantId: string) { return this.items.find((i) => i.id === id && i.tenantId === tenantId) ?? null; }
  async create(d: T) { this.items.push(d); return d; }
  async createMany(d: T[]) { this.items.push(...d); return d; }
  async update(id: string, d: Partial<T>) { const i = this.items.findIndex((x) => x.id === id); this.items[i] = { ...this.items[i], ...d }; return this.items[i]; }
}

const day = (d: number, month = MONTH) => `${YEAR}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`;

function build() {
  const transactions = new Repo<FinancialTransaction>();
  const accounts = new Repo<Account>();
  const invoices = new Repo<CreditCardInvoice>();
  const cards = new Repo<CreditCard>();
  const categories = new Repo<Category>();
  const entries = new Repo<CreditCardEntry>();
  const installments = new Repo<CreditCardInstallment>();

  const cashFlow = new CashFlowService(transactions as never, accounts as never, invoices as never, cards as never);
  const dashboard = new DashboardService(cashFlow, categories as never, entries as never, installments as never);
  const service = new ReportsService(cashFlow, dashboard, categories as never, entries as never, installments as never);

  const account = (name: string, active = true): Account => {
    const a: Account = {
      id: randomUUID(), tenantId: TENANT_ID, name, accountTypeId: null, initialBalance: 100000,
      initialBalanceDate: `${YEAR - 1}-01-01T00:00:00.000Z`, active, autoReserveEnabled: false,
      autoReservePercentage: 0, autoReserveTargetAccountId: null, createdAt: NOW, updatedAt: NOW,
    };
    accounts.items.push(a);
    return a;
  };
  const category = (name: string, type: CategoryType): Category => {
    const c: Category = { id: randomUUID(), tenantId: TENANT_ID, name, type, active: true, createdAt: NOW, updatedAt: NOW };
    categories.items.push(c);
    return c;
  };
  const tx = (data: Partial<FinancialTransaction> & Pick<FinancialTransaction, 'type' | 'amount'>): FinancialTransaction => {
    const t: FinancialTransaction = {
      id: randomUUID(), tenantId: TENANT_ID, description: data.type, categoryId: null,
      expectedDate: day(10), actualDate: null, status: TransactionStatus.PENDING,
      sourceAccountId: null, targetAccountId: null, originType: null, originId: null, transferGroupId: null,
      notes: null, recurrence: RecurrenceType.UNIQUE, recurringGroupId: null, recurringActive: true,
      createdAt: NOW, updatedAt: NOW, ...data,
    };
    transactions.items.push(t);
    return t;
  };
  const transfer = (from: Account, to: Account, amount: number, settled = true, originType = OriginType.TRANSFER) => {
    const groupId = randomUUID();
    tx({
      type: TransactionType.TRANSFER, amount, description: 'Transferência', sourceAccountId: from.id,
      status: settled ? TransactionStatus.PAID : TransactionStatus.PENDING, transferGroupId: groupId, originType,
    });
    tx({
      type: TransactionType.TRANSFER, amount, description: 'Transferência', targetAccountId: to.id,
      status: settled ? TransactionStatus.RECEIVED : TransactionStatus.PENDING, transferGroupId: groupId, originType,
    });
  };
  const card = (name: string, payer: Account | null): CreditCard => {
    const c: CreditCard = {
      id: randomUUID(), tenantId: TENANT_ID, name, bank: 'Banco', closingDay: 1, dueDay: 10, limit: 1000000,
      defaultPaymentAccountId: payer?.id ?? null, active: true, createdAt: NOW, updatedAt: NOW,
    };
    cards.items.push(c);
    return c;
  };
  const invoice = (c: CreditCard, status = InvoiceStatus.PAID, paymentAccountId: string | null = null): CreditCardInvoice => {
    const inv: CreditCardInvoice = {
      id: randomUUID(), tenantId: TENANT_ID, creditCardId: c.id, month: MONTH, year: YEAR, dueDate: day(10),
      totalAmount: 0, status, paymentDate: null, paymentAccountId, createdAt: NOW, updatedAt: NOW,
    };
    invoices.items.push(inv);
    return inv;
  };
  // Compra na fatura; o total da fatura soma como em recalcInvoiceTotals.
  const purchase = (
    inv: CreditCardInvoice,
    amount: number,
    opts: { entryType?: CardEntryType; categoryId?: string; n?: number; of?: number; canceled?: boolean; description?: string } = {},
  ) => {
    const entryType = opts.entryType ?? CardEntryType.CASH;
    const entry: CreditCardEntry = {
      id: randomUUID(), tenantId: TENANT_ID, creditCardId: inv.creditCardId, description: opts.description ?? entryType,
      expenseCategoryId: opts.categoryId ?? '', totalAmount: amount * (opts.of ?? 1), purchaseDate: day(2),
      entryType, installmentsCount: opts.of ?? 1, closingDayUsed: 1, notes: null, externalRef: null,
      active: true, createdAt: NOW, updatedAt: NOW,
    };
    entries.items.push(entry);
    installments.items.push({
      id: randomUUID(), tenantId: TENANT_ID, creditCardEntryId: entry.id, installmentNumber: opts.n ?? 1,
      totalInstallments: opts.of ?? 1, amount, month: MONTH, year: YEAR,
      status: opts.canceled ? InstallmentStatus.CANCELED : InstallmentStatus.OPEN, creditCardInvoiceId: inv.id,
      createdAt: NOW, updatedAt: NOW,
    });
    if (!opts.canceled && entryType !== CardEntryType.PAYMENT) inv.totalAmount += amount;
  };

  return { service, cashFlow, dashboard, account, category, tx, transfer, card, invoice, purchase };
}

describe('ReportsService.getStatement', () => {
  it('com conta: só os lançamentos e faturas dela, e o resumo é o do fluxo de caixa da conta', async () => {
    const b = build();
    const pj = b.account('PJ');
    const pf = b.account('PF');
    const salary = b.category('Serviços', CategoryType.INCOME);
    const rent = b.category('Aluguel', CategoryType.EXPENSE);

    b.tx({ type: TransactionType.INCOME, amount: 500000, targetAccountId: pj.id, categoryId: salary.id,
      description: 'NF cliente', taxRateBps: 600, issueDate: day(5), status: TransactionStatus.RECEIVED, actualDate: day(12) });
    b.tx({ type: TransactionType.INCOME, amount: 70000, targetAccountId: pf.id, description: 'Outra conta' });
    b.tx({ type: TransactionType.PAYMENT, amount: 150000, sourceAccountId: pj.id, categoryId: rent.id,
      description: 'Aluguel', recurrence: RecurrenceType.FIXED, recurringGroupId: 'g1' });
    b.tx({ type: TransactionType.PAYMENT, amount: 30000, sourceAccountId: pj.id, description: 'Imposto a pagar',
      originType: OriginType.INVOICE_TAX, originId: `${pj.id}:${YEAR}-03` });
    b.tx({ type: TransactionType.EXTRA_EXPENSE, amount: 9000, sourceAccountId: pj.id, description: 'Conserto',
      status: TransactionStatus.PAID });
    b.tx({ type: TransactionType.PAYMENT, amount: 1, sourceAccountId: pj.id, description: 'Cancelado',
      status: TransactionStatus.CANCELED });
    // Fora da referência.
    b.tx({ type: TransactionType.PAYMENT, amount: 2, sourceAccountId: pj.id, expectedDate: day(10, 4) });

    const pjCard = b.card('Cartão PJ', pj);
    b.purchase(b.invoice(pjCard), 20000);
    // Paga pela PF mesmo sendo cartão padrão da PJ: sai do escopo da PJ.
    b.purchase(b.invoice(b.card('Outro', pj), InvoiceStatus.PAID, pf.id), 40000);

    const report = await b.service.getStatement(TENANT_ID, { month: MONTH, year: YEAR, accountId: pj.id });
    const flow = await b.cashFlow.getCashFlow(TENANT_ID, { month: MONTH, year: YEAR, accountId: pj.id });

    expect(report.scope).toEqual({ accountId: pj.id, accountName: 'PJ' });
    expect(report.summary).toEqual(flow.summary);

    expect(report.incomes).toEqual([
      expect.objectContaining({
        kind: 'income', description: 'NF cliente', categoryName: 'Serviços', accountName: 'PJ',
        invoiceRatePct: 6, amount: 500000, settled: true, fixed: false, date: day(12),
      }),
    ]);
    expect(report.expenses.map((e) => [e.description, e.kind, e.fixed, e.settled])).toEqual([
      ['Aluguel', 'payment', true, false],
      ['Conserto', 'extra', false, true],
      ['Imposto a pagar', 'invoiceTax', false, false],
    ]);
    expect(report.invoices.map((i) => [i.cardName, i.paymentAccountName, i.total])).toEqual([['Cartão PJ', 'PJ', 20000]]);
    expect(report.accounts).toEqual([
      { id: pj.id, name: 'PJ', initialBalance: flow.summary.initialBalance, balance: flow.summary.realizedBalance },
    ]);
  });

  it('consolidado: resumo igual ao da tela e transferência entre contas ativas fora da lista', async () => {
    const b = build();
    const pj = b.account('PJ');
    const pf = b.account('PF');
    const old = b.account('Antiga', false);

    b.tx({ type: TransactionType.INCOME, amount: 300000, targetAccountId: pj.id, status: TransactionStatus.RECEIVED });
    b.tx({ type: TransactionType.PAYMENT, amount: 50000, sourceAccountId: pf.id, status: TransactionStatus.PAID });
    b.transfer(pj, pf, 100000);
    b.transfer(old, pf, 7000);
    b.purchase(b.invoice(b.card('Cartão', pf)), 12000);

    const report = await b.service.getStatement(TENANT_ID, { month: MONTH, year: YEAR });
    const consolidated = await b.cashFlow.getConsolidatedCashFlow(TENANT_ID, MONTH, YEAR);
    const dash = await b.dashboard.getDashboard(TENANT_ID, { month: MONTH, year: YEAR, upcomingDays: 1, evolutionMonths: 12 });

    expect(report.scope).toEqual({ accountId: null, accountName: null });
    expect(report.summary).toEqual(consolidated.summary);
    expect(report.summary).toEqual(dash.monthSummary);
    expect(report.categories).toEqual(dash.categoryBreakdown);
    expect(report.evolution).toHaveLength(12);
    expect(report.evolution.at(-1)).toMatchObject({ month: MONTH, year: YEAR, income: 300000, expenses: 62000 });

    expect(report.transfers).toEqual([
      expect.objectContaining({ direction: 'in', fromAccountName: 'Antiga', toAccountName: 'PF', amount: 7000, settled: true }),
    ]);
    // Saldo por conta: todas as ativas, somando o saldo final do resumo.
    expect(report.accounts.map((a) => a.name)).toEqual(['PJ', 'PF']);
    expect(report.accounts.reduce((s, a) => s + a.balance, 0)).toBe(report.summary.realizedBalance);
    expect(report.accounts.reduce((s, a) => s + a.initialBalance, 0)).toBe(report.summary.initialBalance);
  });

  it('com conta: as duas direções de transferência dela aparecem, inclusive a reserva automática', async () => {
    const b = build();
    const pj = b.account('PJ');
    const reserve = b.account('Reserva');
    b.transfer(pj, reserve, 25000, true, OriginType.AUTO_RESERVE);
    b.transfer(reserve, pj, 5000, false);

    const report = await b.service.getStatement(TENANT_ID, { month: MONTH, year: YEAR, accountId: pj.id });

    expect(report.transfers.map((t) => [t.direction, t.fromAccountName, t.toAccountName, t.autoReserve, t.settled])).toEqual(
      expect.arrayContaining([
        ['out', 'PJ', 'Reserva', true, true],
        ['in', 'Reserva', 'PJ', false, false],
      ]),
    );
    expect(report.transfers).toHaveLength(2);
  });

  it('compras da fatura: sem PAYMENT e sem canceladas, estorno marcado, soma igual ao total', async () => {
    const b = build();
    const pf = b.account('PF');
    const food = b.category('Mercado', CategoryType.EXPENSE);
    const inv = b.invoice(b.card('Cartão', pf));
    b.purchase(inv, 30000, { categoryId: food.id, n: 3, of: 10, description: 'Geladeira' });
    b.purchase(inv, 8000, { categoryId: food.id, description: 'Feira' });
    b.purchase(inv, -2000, { entryType: CardEntryType.REFUND, categoryId: food.id, description: 'Estorno' });
    b.purchase(inv, 999, { canceled: true, description: 'Cancelada' });
    b.purchase(inv, -36000, { entryType: CardEntryType.PAYMENT, description: 'Pagamento' });
    // Fatura vazia some do relatório.
    b.invoice(b.card('Sem uso', pf), InvoiceStatus.OPEN);

    const report = await b.service.getStatement(TENANT_ID, { month: MONTH, year: YEAR, accountId: pf.id });

    expect(report.invoices).toHaveLength(1);
    const [invoice] = report.invoices;
    expect(invoice.total).toBe(36000);
    expect(invoice.purchases.map((p) => [p.description, p.installment, p.amount, p.refund, p.categoryName])).toEqual([
      ['Estorno', null, -2000, true, 'Mercado'],
      ['Feira', null, 8000, false, 'Mercado'],
      ['Geladeira', '3/10', 30000, false, 'Mercado'],
    ]);
    expect(invoice.purchases.reduce((s, p) => s + p.amount, 0)).toBe(invoice.total);
    // Categorias do Dashboard: as compras pela categoria delas, sem fatia "cartão".
    expect(report.categories.expenses).toEqual([
      expect.objectContaining({ categoryName: 'Mercado', amount: 36000, percentage: 100 }),
    ]);
  });

  it('materializa os fixos da referência uma vez só', async () => {
    const b = build();
    const pj = b.account('PJ');
    b.tx({ type: TransactionType.PAYMENT, amount: 1000, sourceAccountId: pj.id, description: 'Fixo',
      recurrence: RecurrenceType.FIXED, expectedDate: day(10, 1) });

    const report = await b.service.getStatement(TENANT_ID, { month: MONTH, year: YEAR, accountId: pj.id });

    expect(report.expenses.map((e) => [e.description, e.fixed])).toEqual([['Fixo', true]]);
  });
});
