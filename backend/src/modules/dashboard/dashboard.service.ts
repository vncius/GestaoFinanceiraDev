import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardEntriesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInstallmentsRepository } from '../credit-cards/credit-cards.repository';
import { CardEntryType, CreditCardInvoice, InstallmentStatus, InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { AppError } from '../../shared/errors/app-error';
import {
  AlertSeverity,
  AlertType,
  CategoryBreakdownItem,
  DashboardAlert,
  DashboardResponse,
  DueType,
  MonthlyEvolutionItem,
  UpcomingDue,
} from './dashboard.types';
import { DashboardQuery } from './dashboard.schemas';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import { CashFlowSummary } from '../cash-flow/cash-flow.types';
import { calcAccountBalance } from '../../shared/utils/balance.utils';

const ZERO_SUMMARY: CashFlowSummary = {
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
  transferInflow: 0,
  expectedTransferInflow: 0,
  transferOutflow: 0,
  expectedTransferOutflow: 0,
  projectedBalance: 0,
  realizedBalance: 0,
};

function sumSummaries(a: CashFlowSummary, b: CashFlowSummary): CashFlowSummary {
  return {
    initialBalance: a.initialBalance + b.initialBalance,
    projectedInitialBalance: a.projectedInitialBalance + b.projectedInitialBalance,
    expectedIncome: a.expectedIncome + b.expectedIncome,
    receivedIncome: a.receivedIncome + b.receivedIncome,
    expectedPayments: a.expectedPayments + b.expectedPayments,
    paidPayments: a.paidPayments + b.paidPayments,
    expectedExtraExpenses: a.expectedExtraExpenses + b.expectedExtraExpenses,
    paidExtraExpenses: a.paidExtraExpenses + b.paidExtraExpenses,
    creditCardInvoices: a.creditCardInvoices + b.creditCardInvoices,
    paidCreditCardInvoices: a.paidCreditCardInvoices + b.paidCreditCardInvoices,
    transferInflow: a.transferInflow + b.transferInflow,
    expectedTransferInflow: a.expectedTransferInflow + b.expectedTransferInflow,
    transferOutflow: a.transferOutflow + b.transferOutflow,
    expectedTransferOutflow: a.expectedTransferOutflow + b.expectedTransferOutflow,
    projectedBalance: a.projectedBalance + b.projectedBalance,
    realizedBalance: a.realizedBalance + b.realizedBalance,
  };
}

export class DashboardService {
  constructor(
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly invoicesRepo: CreditCardInvoicesRepository,
    private readonly cashFlowService: CashFlowService,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly cardEntriesRepo: CreditCardEntriesRepository,
    private readonly installmentsRepo: CreditCardInstallmentsRepository,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  async getDashboard(tenantId: string, query: DashboardQuery): Promise<DashboardResponse> {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const settings = await this.settingsRepo.get(tenantId);
    const scopedToAccount = settings?.dashboardScope === 'ACCOUNT';
    if (scopedToAccount && !query.accountId) {
      throw new AppError(
        'Selecione uma conta para o dashboard por conta.',
        400,
        'dashboard.accountRequired',
      );
    }
    const accountId = query.accountId ?? null;

    const [
      allTransactions,
      allAccounts,
      allCards,
      allInvoices,
      allCategories,
      allCardEntries,
      allInstallments,
    ] = await Promise.all([
      this.transactionsRepo.findAll(tenantId),
      this.accountsRepo.findAll(tenantId),
      this.creditCardsRepo.findAll(tenantId),
      this.invoicesRepo.findAll(tenantId),
      this.categoriesRepo.findAll(tenantId),
      this.cardEntriesRepo.findAll(tenantId),
      this.installmentsRepo.findAll(tenantId),
    ]);

    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const cardEntryMap = new Map(allCardEntries.map((e) => [e.id, e]));
    const activeAccounts = allAccounts.filter((a) => a.active);

    const invoicePayerAccountId = (inv: CreditCardInvoice): string | null =>
      inv.paymentAccountId ?? cardMap.get(inv.creditCardId)?.defaultPaymentAccountId ?? null;
    // Sem filtro nenhum em modo consolidado; em modo por conta, só passa o
    // que pertence (ou seria debitado/creditado) na conta selecionada.
    const matchesScope = (ownerAccountId: string | null) =>
      !scopedToAccount || ownerAccountId === accountId;

    // Resumo mensal centralizado no CashFlowService (fonte única de verdade):
    // em modo por conta, é o resumo da própria conta; em modo consolidado,
    // soma o resumo de cada conta ativa (mesma lógica de cálculo, sem duplicar
    // regra de negócio aqui). Sequencial (não Promise.all) para não disparar
    // ensureFixedTransactions em paralelo e materializar recorrência em duplicidade.
    let monthSummary: CashFlowSummary;
    if (scopedToAccount) {
      monthSummary = (await this.cashFlowService.getCashFlow(tenantId, { month, year, accountId: accountId! })).summary;
    } else {
      monthSummary = ZERO_SUMMARY;
      for (const a of activeAccounts) {
        const cf = await this.cashFlowService.getCashFlow(tenantId, { month, year, accountId: a.id });
        monthSummary = sumSummaries(monthSummary, cf.summary);
      }
    }

    // ── Saldos atuais das contas (não relativos ao mês) ─────────────────────────
    // Em modo por conta, accounts.list/totalBalance mostram só a conta
    // selecionada — em modo consolidado, todas as contas ativas.
    // isReserve (E8): a flag de reserva automática agora fica na conta de
    // ORIGEM (não mais na própria conta marcada) — "é reserva" passa a
    // significar "é destino de alguma regra de reserva ativa".
    const reserveTargetIds = new Set(
      activeAccounts
        .filter((a) => a.autoReserveEnabled && a.autoReserveTargetAccountId)
        .map((a) => a.autoReserveTargetAccountId as string),
    );
    const balanceAccounts = scopedToAccount
      ? activeAccounts.filter((a) => a.id === accountId)
      : activeAccounts;
    const accountBalances = balanceAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: calcAccountBalance(a, allTransactions),
      isReserve: reserveTargetIds.has(a.id),
    }));
    const totalBalance = accountBalances.reduce((s, a) => s + a.balance, 0);

    // ── Upcoming dues ───────────────────────────────────────────────────────────
    const cutoff = new Date(
      today.getTime() + query.upcomingDays * 24 * 60 * 60 * 1000,
    );

    const upcomingTxDues: UpcomingDue[] = allTransactions
      .filter((t) => {
        if (t.status !== TransactionStatus.PENDING) return false;
        if (
          t.type !== TransactionType.PAYMENT &&
          t.type !== TransactionType.EXTRA_EXPENSE
        )
          return false;
        if (!matchesScope(t.sourceAccountId)) return false;
        const d = new Date(t.expectedDate);
        return d >= today && d <= cutoff;
      })
      .map((t) => ({
        type:
          t.type === TransactionType.PAYMENT
            ? DueType.PAYMENT
            : DueType.EXTRA_EXPENSE,
        id: t.id,
        description: t.description,
        dueDate: t.expectedDate,
        amount: t.amount,
        status: t.status,
      }));

    const upcomingInvoiceDues: UpcomingDue[] = allInvoices
      .filter((inv) => {
        if (
          inv.status !== InvoiceStatus.OPEN &&
          inv.status !== InvoiceStatus.OVERDUE
        )
          return false;
        if (!matchesScope(invoicePayerAccountId(inv))) return false;
        const d = new Date(inv.dueDate);
        return d >= today && d <= cutoff;
      })
      .map((inv) => {
        const card = cardMap.get(inv.creditCardId);
        return {
          type: DueType.CREDIT_CARD_INVOICE,
          id: inv.id,
          description: `Fatura ${card?.name ?? 'cartão'} ${inv.month}/${inv.year}`,
          dueDate: inv.dueDate,
          amount: inv.totalAmount,
          status: inv.status,
        };
      });

    const upcomingDues = [...upcomingTxDues, ...upcomingInvoiceDues].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

    // ── Alerts ──────────────────────────────────────────────────────────────────
    const alerts: DashboardAlert[] = [];

    const overduePayments = allTransactions.filter(
      (t) =>
        t.status === TransactionStatus.PENDING &&
        (t.type === TransactionType.PAYMENT ||
          t.type === TransactionType.EXTRA_EXPENSE) &&
        matchesScope(t.sourceAccountId) &&
        new Date(t.expectedDate) < today,
    );
    if (overduePayments.length > 0) {
      alerts.push({
        type: AlertType.OVERDUE_PAYMENT,
        message: `${overduePayments.length} pagamento(s) vencido(s) sem baixa`,
        severity: AlertSeverity.ERROR,
      });
    }

    const overdueReceivables = allTransactions.filter(
      (t) =>
        t.type === TransactionType.INCOME &&
        t.status === TransactionStatus.PENDING &&
        matchesScope(t.targetAccountId) &&
        new Date(t.expectedDate) < today,
    );
    if (overdueReceivables.length > 0) {
      alerts.push({
        type: AlertType.OVERDUE_RECEIVABLE,
        message: `${overdueReceivables.length} recebimento(s) atrasado(s)`,
        severity: AlertSeverity.WARNING,
      });
    }

    const sevenDaysCutoff = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const invoicesDueSoon = allInvoices.filter((inv) => {
      if (inv.status !== InvoiceStatus.OPEN) return false;
      if (!matchesScope(invoicePayerAccountId(inv))) return false;
      const d = new Date(inv.dueDate);
      return d <= sevenDaysCutoff;
    });
    if (invoicesDueSoon.length > 0) {
      alerts.push({
        type: AlertType.INVOICE_DUE_SOON,
        message: `${invoicesDueSoon.length} fatura(s) vencem nos próximos 7 dias`,
        severity: AlertSeverity.WARNING,
      });
    }

    // ── Monthly evolution ────────────────────────────────────────────────────────
    const monthlyEvolution: MonthlyEvolutionItem[] = [];
    for (let i = query.evolutionMonths - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      const mYM = `${y}-${String(m).padStart(2, '0')}`;

      const mIncome = allTransactions
        .filter((t) => {
          if (t.type !== TransactionType.INCOME || t.status !== TransactionStatus.RECEIVED) return false;
          if (!matchesScope(t.targetAccountId)) return false;
          return t.expectedDate.slice(0, 7) === mYM;
        })
        .reduce((s, t) => s + t.amount, 0);

      const mExpenses = allTransactions
        .filter((t) => {
          if (t.status !== TransactionStatus.PAID) return false;
          if (
            t.type !== TransactionType.PAYMENT &&
            t.type !== TransactionType.EXTRA_EXPENSE
          )
            return false;
          if (!matchesScope(t.sourceAccountId)) return false;
          return t.expectedDate.slice(0, 7) === mYM;
        })
        .reduce((s, t) => s + t.amount, 0);

      const mCreditCards = allInvoices
        .filter(
          (inv) =>
            inv.status === InvoiceStatus.PAID &&
            matchesScope(invoicePayerAccountId(inv)) &&
            inv.month === m &&
            inv.year === y,
        )
        .reduce((s, inv) => s + inv.totalAmount, 0);

      const expenses = mExpenses + mCreditCards;
      monthlyEvolution.push({ month: m, year: y, income: mIncome, expenses, net: mIncome - expenses });
    }

    // ── Category breakdown (mês selecionado) ───────────────────────────────────
    const currentYM = `${year}-${String(month).padStart(2, '0')}`;

    const incomeByCategory = new Map<string, number>();
    for (const t of allTransactions) {
      if (t.type !== TransactionType.INCOME || t.status !== TransactionStatus.RECEIVED) continue;
      if (!matchesScope(t.targetAccountId)) continue;
      if (t.expectedDate.slice(0, 7) !== currentYM) continue;
      const key = t.categoryId ?? '';
      incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + t.amount);
    }

    const expensesByCategory = new Map<string, number>();
    for (const t of allTransactions) {
      if (t.status !== TransactionStatus.PAID) continue;
      if (
        t.type !== TransactionType.PAYMENT &&
        t.type !== TransactionType.EXTRA_EXPENSE
      )
        continue;
      if (!matchesScope(t.sourceAccountId)) continue;
      if (t.expectedDate.slice(0, 7) !== currentYM) continue;
      const key = t.categoryId ?? '';
      expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + t.amount);
    }

    // Lançamentos de fatura de cartão são atribuídos à categoria do lançamento
    // original (expenseCategoryId), não a um bucket genérico de "cartão".
    const paidInvoiceIds = new Set(
      allInvoices
        .filter(
          (inv) =>
            inv.status === InvoiceStatus.PAID &&
            matchesScope(invoicePayerAccountId(inv)) &&
            inv.month === month &&
            inv.year === year,
        )
        .map((inv) => inv.id),
    );
    for (const inst of allInstallments) {
      if (!inst.creditCardInvoiceId || !paidInvoiceIds.has(inst.creditCardInvoiceId))
        continue;
      if (inst.status === InstallmentStatus.CANCELED) continue;
      const entry = cardEntryMap.get(inst.creditCardEntryId);
      // PAYMENT é o crédito interno do pagamento da fatura, não uma
      // despesa — excluído do breakdown (senão corrompe o total com um
      // valor negativo sem categoria de despesa real).
      if (entry?.entryType === CardEntryType.PAYMENT) continue;
      const key = entry?.expenseCategoryId ?? '';
      expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + inst.amount);
    }

    const toBreakdownItems = (
      byCategory: Map<string, number>,
      resolveName: (key: string) => string,
    ): CategoryBreakdownItem[] => {
      const total = [...byCategory.values()].reduce((s, v) => s + v, 0);
      return [...byCategory.entries()]
        .map(([key, amount]) => ({
          categoryId: key === '' ? null : key,
          categoryName: resolveName(key),
          amount,
          percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
    };

    const categoryBreakdown = {
      income: toBreakdownItems(incomeByCategory, (key) =>
        key === '' ? 'Sem categoria' : categoryMap.get(key)?.name ?? 'Sem categoria',
      ),
      expenses: toBreakdownItems(expensesByCategory, (key) =>
        key === '' ? 'Sem categoria' : categoryMap.get(key)?.name ?? 'Sem categoria',
      ),
    };

    return {
      month,
      year,
      accounts: {
        list: accountBalances,
        totalBalance,
      },
      monthSummary,
      upcomingDues,
      alerts,
      monthlyEvolution,
      categoryBreakdown,
    };
  }

}
