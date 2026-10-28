import { CashFlowService } from '../cash-flow/cash-flow.service';
import { CashFlowResponse, CashFlowTransaction } from '../cash-flow/cash-flow.types';
import { DashboardService } from '../dashboard/dashboard.service';
import { CategoriesRepository } from '../categories/categories.repository';
import {
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
} from '../credit-cards/credit-cards.repository';
import { CardEntryType, InstallmentStatus } from '../credit-cards/credit-cards.types';
import {
  OriginType,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { StatementQuery } from './reports.schemas';
import {
  StatementInvoice,
  StatementLine,
  StatementLineKind,
  StatementReport,
  StatementTransfer,
} from './reports.types';

// Monta o relatório só com as regras que já existem: listas e resumo do fluxo
// de caixa (por conta ou consolidado), categorias e evolução do Dashboard, e
// as compras de cada fatura pelas parcelas ligadas a ela.
export class ReportsService {
  constructor(
    private readonly cashFlowService: CashFlowService,
    private readonly dashboardService: DashboardService,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly cardEntriesRepo: CreditCardEntriesRepository,
    private readonly installmentsRepo: CreditCardInstallmentsRepository,
  ) {}

  async getStatement(tenantId: string, query: StatementQuery): Promise<StatementReport> {
    const { month, year } = query;
    const accountId = query.accountId ?? null;

    // Um retrato só: loadDataset materializa os fixos da referência (leitura
    // com efeito colateral), então o fluxo e o Dashboard reaproveitam o mesmo.
    const dataset = await this.cashFlowService.loadDataset(tenantId, month, year);
    const activeIds = dataset.accounts.filter((a) => a.active).map((a) => a.id);
    const scopeIds = accountId ? [accountId] : activeIds;

    const flow: CashFlowResponse = accountId
      ? await this.cashFlowService.getCashFlow(tenantId, { month, year, accountId }, dataset)
      : await this.cashFlowService.getConsolidatedCashFlow(tenantId, month, year, dataset);
    const [perAccount, dashboard, categories, cardEntries, installments] = await Promise.all([
      this.cashFlowService.getCashFlowMany(tenantId, month, year, scopeIds, dataset),
      this.dashboardService.getDashboard(
        tenantId,
        { month, year, accountId: accountId ?? undefined, upcomingDays: 1, evolutionMonths: 12 },
        dataset,
      ),
      this.categoriesRepo.findAll(tenantId),
      this.cardEntriesRepo.findAll(tenantId),
      this.installmentsRepo.findAll(tenantId),
    ]);

    const accountName = new Map(dataset.accounts.map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const cardMap = new Map(dataset.cards.map((c) => [c.id, c]));
    const entryMap = new Map(cardEntries.map((e) => [e.id, e]));
    const nameOf = (id: string | null) => (id ? accountName.get(id) ?? '—' : '—');

    const toLine = (t: CashFlowTransaction, kind: StatementLineKind): StatementLine => {
      const settled = t.status === TransactionStatus.PAID || t.status === TransactionStatus.RECEIVED;
      return {
        id: t.id,
        date: settled && t.actualDate ? t.actualDate : t.expectedDate,
        kind,
        description: t.description,
        categoryName: t.categoryId ? categoryName.get(t.categoryId) ?? null : null,
        accountName: nameOf(t.type === TransactionType.INCOME ? t.targetAccountId : t.sourceAccountId),
        invoiceRatePct: t.taxRateBps != null ? t.taxRateBps / 100 : null,
        amount: t.amount,
        settled,
        fixed: t.recurrence === RecurrenceType.FIXED,
      };
    };
    const byDate = <T extends { date: string; description: string }>(a: T, b: T) =>
      a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.description.localeCompare(b.description);

    const incomes = flow.entries.map((t) => toLine(t, 'income')).sort(byDate);
    const expenses = [
      ...flow.payments.map((t) => toLine(t, t.originType === OriginType.INVOICE_TAX ? 'invoiceTax' : 'payment')),
      ...flow.extraExpenses.map((t) => toLine(t, 'extra')),
    ].sort(byDate);

    // Compras da fatura: as parcelas ligadas a ela, sem o crédito interno do
    // pagamento (PAYMENT) e sem as canceladas — a mesma soma de invoice.totalAmount.
    const purchasesByInvoice = new Map<string, StatementInvoice['purchases']>();
    for (const inst of installments) {
      if (!inst.creditCardInvoiceId || inst.status === InstallmentStatus.CANCELED) continue;
      const entry = entryMap.get(inst.creditCardEntryId);
      if (!entry || entry.entryType === CardEntryType.PAYMENT) continue;
      const list = purchasesByInvoice.get(inst.creditCardInvoiceId) ?? [];
      list.push({
        purchaseDate: entry.purchaseDate,
        description: entry.description,
        categoryName: categoryName.get(entry.expenseCategoryId) ?? null,
        installment: inst.totalInstallments > 1 ? `${inst.installmentNumber}/${inst.totalInstallments}` : null,
        amount: inst.amount,
        refund: entry.entryType === CardEntryType.REFUND,
      });
      purchasesByInvoice.set(inst.creditCardInvoiceId, list);
    }
    const invoices: StatementInvoice[] = flow.creditCards
      .map((inv) => {
        const card = cardMap.get(inv.creditCardId);
        const purchases = (purchasesByInvoice.get(inv.id) ?? []).sort(
          (a, b) =>
            a.purchaseDate.slice(0, 10).localeCompare(b.purchaseDate.slice(0, 10)) ||
            a.description.localeCompare(b.description),
        );
        const payerId = inv.paymentAccountId ?? card?.defaultPaymentAccountId ?? null;
        return {
          id: inv.id,
          cardName: card?.name ?? '—',
          dueDate: inv.dueDate,
          status: inv.status,
          paymentAccountName: payerId ? accountName.get(payerId) ?? null : null,
          total: inv.totalAmount,
          purchases,
        };
      })
      // Fatura vazia (sem compra e com total zero) não diz nada no extrato.
      .filter((inv) => inv.total !== 0 || inv.purchases.length > 0)
      .sort((a, b) => a.dueDate.slice(0, 10).localeCompare(b.dueDate.slice(0, 10)) || a.cardName.localeCompare(b.cardName));

    // No consolidado, getConsolidatedCashFlow já tirou as transferências entre
    // contas ativas (decisão 4); sobra uma perna por transferência.
    const transfers: StatementTransfer[] = flow.transfers
      .map((t) => {
        const settled = t.status === TransactionStatus.PAID || t.status === TransactionStatus.RECEIVED;
        const own = nameOf(t.accountId);
        return {
          id: t.id,
          date: settled && t.actualDate ? t.actualDate : t.expectedDate,
          description: t.description,
          direction: t.direction === 'IN' ? ('in' as const) : ('out' as const),
          fromAccountName: t.direction === 'IN' ? t.counterpartAccountName : own,
          toAccountName: t.direction === 'IN' ? own : t.counterpartAccountName,
          amount: t.amount,
          settled,
          autoReserve: t.isAutoReserve,
        };
      })
      .sort(byDate);

    const accounts = perAccount.map((f, i) => ({
      id: scopeIds[i],
      name: nameOf(scopeIds[i]),
      initialBalance: f.summary.initialBalance,
      balance: f.summary.realizedBalance,
    }));

    return {
      month,
      year,
      scope: { accountId, accountName: accountId ? nameOf(accountId) : null },
      generatedAt: new Date().toISOString(),
      summary: flow.summary,
      accounts,
      categories: dashboard.categoryBreakdown,
      evolution: dashboard.monthlyEvolution,
      incomes,
      expenses,
      invoices,
      transfers,
    };
  }
}
