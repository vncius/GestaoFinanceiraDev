import { ReceivablesRepository } from '../receivables/receivables.repository';
import { ReceivableStatus } from '../receivables/receivables.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardEntriesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInstallmentsRepository } from '../credit-cards/credit-cards.repository';
import { CardEntryType, InstallmentStatus, InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CategoriesRepository } from '../categories/categories.repository';
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
import { calcAccountBalance } from '../../shared/utils/balance.utils';

export class DashboardService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly invoicesRepo: CreditCardInvoicesRepository,
    private readonly cashFlowService: CashFlowService,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly cardEntriesRepo: CreditCardEntriesRepository,
    private readonly installmentsRepo: CreditCardInstallmentsRepository,
  ) {}

  async getDashboard(tenantId: string, query: DashboardQuery): Promise<DashboardResponse> {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Resumo mensal centralizado no CashFlowService (fonte única de verdade)
    const cashFlow = await this.cashFlowService.getCashFlow(tenantId, { month, year });
    const monthSummary = cashFlow.summary;

    const [
      allReceivables,
      allTransactions,
      allAccounts,
      settings,
      allCards,
      allInvoices,
      allCategories,
      allCardEntries,
      allInstallments,
    ] = await Promise.all([
      this.receivablesRepo.findAll(tenantId),
      this.transactionsRepo.findAll(tenantId),
      this.accountsRepo.findAll(tenantId),
      this.settingsRepo.get(tenantId),
      this.creditCardsRepo.findAll(tenantId),
      this.invoicesRepo.findAll(tenantId),
      this.categoriesRepo.findAll(tenantId),
      this.cardEntriesRepo.findAll(tenantId),
      this.installmentsRepo.findAll(tenantId),
    ]);

    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const cardEntryMap = new Map(allCardEntries.map((e) => [e.id, e]));

    // ── Saldos atuais das contas (não relativos ao mês) ─────────────────────────
    const activeAccounts = allAccounts.filter((a) => a.active);
    const accountBalances = activeAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: calcAccountBalance(a, allTransactions),
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
    const minBalance = settings?.minimumMainBalance ?? 0;

    if (minBalance > 0 && monthSummary.projectedBalance < minBalance) {
      alerts.push({
        type: AlertType.LOW_BALANCE,
        message: `Saldo projetado abaixo do mínimo desejado`,
        severity: AlertSeverity.WARNING,
      });
    }

    const overduePayments = allTransactions.filter(
      (t) =>
        t.status === TransactionStatus.PENDING &&
        (t.type === TransactionType.PAYMENT ||
          t.type === TransactionType.EXTRA_EXPENSE) &&
        new Date(t.expectedDate) < today,
    );
    if (overduePayments.length > 0) {
      alerts.push({
        type: AlertType.OVERDUE_PAYMENT,
        message: `${overduePayments.length} pagamento(s) vencido(s) sem baixa`,
        severity: AlertSeverity.ERROR,
      });
    }

    const overdueReceivables = allReceivables.filter(
      (r) =>
        r.status === ReceivableStatus.EXPECTED &&
        new Date(r.expectedPaymentDate) < today,
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

    // ── Annual summary ──────────────────────────────────────────────────────────
    const pjLimitControlEnabled = settings?.pjLimitControlEnabled ?? true;
    const notaFiscalCategory = allCategories.find((c) => c.protected);
    const annualLimit = pjLimitControlEnabled ? settings?.annualRevenueLimit ?? 0 : 0;
    const grossIncome = pjLimitControlEnabled
      ? allReceivables
          .filter((r) => {
            if (r.status !== ReceivableStatus.RECEIVED) return false;
            if (!notaFiscalCategory || r.incomeCategoryId !== notaFiscalCategory.id) return false;
            return r.expectedPaymentDate.slice(0, 4) === String(year);
          })
          .reduce((s, r) => s + r.grossAmount, 0)
      : 0;

    if (pjLimitControlEnabled && annualLimit > 0 && grossIncome >= annualLimit * 0.8) {
      alerts.push({
        type: AlertType.ANNUAL_LIMIT_WARNING,
        message:
          grossIncome >= annualLimit
            ? `Limite anual de faturamento atingido`
            : `Faturamento anual próximo do limite (${Math.round((grossIncome / annualLimit) * 100)}% utilizado)`,
        severity:
          grossIncome >= annualLimit ? AlertSeverity.ERROR : AlertSeverity.WARNING,
      });
    }

    const limitUsedPercentage =
      pjLimitControlEnabled && annualLimit > 0
        ? Math.round((grossIncome / annualLimit) * 100)
        : 0;

    // ── Monthly evolution ────────────────────────────────────────────────────────
    const monthlyEvolution: MonthlyEvolutionItem[] = [];
    for (let i = query.evolutionMonths - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      const mYM = `${y}-${String(m).padStart(2, '0')}`;

      // Receita bruta (antes da reserva) — comparável ao total de saídas,
      // já que o valor reservado não é gasto, apenas realocado para outra conta.
      const mIncome = allReceivables
        .filter((r) => {
          if (r.status !== ReceivableStatus.RECEIVED) return false;
          return r.expectedPaymentDate.slice(0, 7) === mYM;
        })
        .reduce((s, r) => s + r.grossAmount, 0);

      const mExpenses = allTransactions
        .filter((t) => {
          if (t.status !== TransactionStatus.PAID) return false;
          if (
            t.type !== TransactionType.PAYMENT &&
            t.type !== TransactionType.EXTRA_EXPENSE
          )
            return false;
          return t.expectedDate.slice(0, 7) === mYM;
        })
        .reduce((s, t) => s + t.amount, 0);

      const mCreditCards = allInvoices
        .filter(
          (inv) =>
            inv.status === InvoiceStatus.PAID &&
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
    for (const r of allReceivables) {
      if (r.status !== ReceivableStatus.RECEIVED) continue;
      if (r.expectedPaymentDate.slice(0, 7) !== currentYM) continue;
      const key = r.incomeCategoryId ?? '';
      incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + r.netAmount);
    }

    const expensesByCategory = new Map<string, number>();
    for (const t of allTransactions) {
      if (t.status !== TransactionStatus.PAID) continue;
      if (
        t.type !== TransactionType.PAYMENT &&
        t.type !== TransactionType.EXTRA_EXPENSE
      )
        continue;
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
      annualSummary: {
        grossIncome,
        annualLimit,
        limitUsedPercentage,
        enabled: pjLimitControlEnabled,
      },
      monthlyEvolution,
      categoryBreakdown,
    };
  }

}
