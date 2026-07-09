import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, addMonths, monthKey, monthYearOf } from '../../shared/utils/date.utils';
import { calcAccountBalance } from '../../shared/utils/balance.utils';
import { ReceivablesRepository } from '../receivables/receivables.repository';
import { ReceivableStatus } from '../receivables/receivables.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CashFlowResponse } from './cash-flow.types';
import {
  CashFlowQuery,
  CreateTransactionInput,
  UpdateTransactionInput,
  PayActionInput,
} from './cash-flow.schemas';
import { DeleteScope } from '../../shared/types/recurrence.types';

export class CashFlowService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly creditCardInvoicesRepo?: CreditCardInvoicesRepository,
  ) {}

  // ─── GET /cash-flow ──────────────────────────────────────────────────────────

  async getCashFlow(tenantId: string, query: CashFlowQuery): Promise<CashFlowResponse> {
    const { month, year } = query;

    await this.ensureFixedOccurrences(tenantId, month, year);

    // Uma única leitura de cada arquivo — os filtros por mês e por intervalo
    // (usados pelas previsões) são feitos em memória sobre esses arrays,
    // em vez de buscar novamente no repositório por período.
    const [allReceivables, allTransactions, settings, allInvoices] = await Promise.all([
      this.receivablesRepo.findAll(tenantId),
      this.transactionsRepo.findAll(tenantId),
      this.settingsRepo.get(tenantId),
      this.creditCardInvoicesRepo?.findAll(tenantId) ?? Promise.resolve([]),
    ]);

    // "Previsto" acumula do mês atual (real) até o mês de referência quando
    // este está no futuro — ex.: hoje é 07 e a referência é 12, soma 07..12.
    // Para mês de referência igual/anterior ao atual, o intervalo colapsa
    // para o próprio mês, preservando o comportamento anterior.
    const selectedKey = monthKey(month, year);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const isFutureSelection = selectedKey > monthKey(currentMonth, currentYear);
    const rangeStartMonth = isFutureSelection ? currentMonth : month;
    const rangeStartYear = isFutureSelection ? currentYear : year;
    const rangeStartKey = monthKey(rangeStartMonth, rangeStartYear);

    const dateKey = (iso: string) => {
      const { month: m, year: y } = monthYearOf(iso);
      return monthKey(m, y);
    };
    const inSelectedMonth = (key: number) => key === selectedKey;
    const inProjectionRange = (key: number) => key >= rangeStartKey && key <= selectedKey;

    const monthInvoices = allInvoices.filter(
      (inv) => inv.status !== InvoiceStatus.CANCELED && inSelectedMonth(monthKey(inv.month, inv.year)),
    );
    const rangeInvoices = allInvoices.filter(
      (inv) => inv.status !== InvoiceStatus.CANCELED && inProjectionRange(monthKey(inv.month, inv.year)),
    );

    const entries = allReceivables.filter(
      (r) => r.status !== ReceivableStatus.CANCELED && inSelectedMonth(dateKey(r.expectedPaymentDate)),
    );
    const rangeEntries = allReceivables.filter(
      (r) => r.status !== ReceivableStatus.CANCELED && inProjectionRange(dateKey(r.expectedPaymentDate)),
    );

    const payments = allTransactions.filter(
      (t) => t.type === TransactionType.PAYMENT && !this.isExcludedFromFlow(t) && inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangePayments = allTransactions.filter(
      (t) => t.type === TransactionType.PAYMENT && !this.isExcludedFromFlow(t) && inProjectionRange(dateKey(t.expectedDate)),
    );

    const extraExpenses = allTransactions.filter(
      (t) => t.type === TransactionType.EXTRA_EXPENSE && !this.isExcludedFromFlow(t) && inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangeExtraExpenses = allTransactions.filter(
      (t) => t.type === TransactionType.EXTRA_EXPENSE && !this.isExcludedFromFlow(t) && inProjectionRange(dateKey(t.expectedDate)),
    );

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1); // primeiro dia do mês seguinte
    const mainId = settings?.mainAccountId ?? null;

    // Contas de reserva agora são configuradas individualmente (Account.autoReserveEnabled),
    // em vez de um único settings.emergencyReserveAccountId.
    const allAccounts = await this.accountsRepo.findActive(tenantId);
    const reserveAccounts = allAccounts.filter((a) => a.autoReserveEnabled);
    const reserveAccountIds = new Set(reserveAccounts.map((a) => a.id));

    // O saldo inicial da projeção só precisa ser recalculado com um corte
    // diferente (início do mês atual) quando a referência é futura; nos
    // demais casos reaproveita o mesmo saldo do mês selecionado (initialBalance).
    // Para a reserva, o corte em rangeStart já coincide com o início do mês
    // selecionado quando a referência não é futura, então é sempre calculado
    // diretamente (mesma lógica de acúmulo futuro dos demais campos previstos).
    const rangeStart = new Date(rangeStartYear, rangeStartMonth - 1, 1);
    const mainAccount = mainId ? await this.accountsRepo.findById(mainId, tenantId) : null;

    const mainInitial = mainAccount ? calcAccountBalance(mainAccount, allTransactions, monthStart) : 0;
    const reserveEndBalance = reserveAccounts.reduce(
      (s, a) => s + calcAccountBalance(a, allTransactions, monthEnd),
      0,
    );
    const futureRangeInitial =
      isFutureSelection && mainAccount ? calcAccountBalance(mainAccount, allTransactions, rangeStart) : null;
    const reserveProjectedInitialBalance = reserveAccounts.reduce(
      (s, a) => s + calcAccountBalance(a, allTransactions, rangeStart),
      0,
    );

    const initialBalance = mainInitial;
    const projectedInitialBalance = futureRangeInitial ?? initialBalance;

    // Transações de contas de reserva não afetam os totais da conta principal
    const mainEntries = entries.filter(
      (r) => !r.targetAccountId || !reserveAccountIds.has(r.targetAccountId),
    );
    const mainPayments = payments.filter(
      (t) => !t.sourceAccountId || !reserveAccountIds.has(t.sourceAccountId),
    );
    const mainExtraExpenses = extraExpenses.filter(
      (t) => !t.sourceAccountId || !reserveAccountIds.has(t.sourceAccountId),
    );

    const rangeMainEntries = rangeEntries.filter(
      (r) => !r.targetAccountId || !reserveAccountIds.has(r.targetAccountId),
    );
    const rangeMainPayments = rangePayments.filter(
      (t) => !t.sourceAccountId || !reserveAccountIds.has(t.sourceAccountId),
    );
    const rangeMainExtraExpenses = rangeExtraExpenses.filter(
      (t) => !t.sourceAccountId || !reserveAccountIds.has(t.sourceAccountId),
    );

    // realizado — sempre restrito ao mês selecionado
    const receivedIncome = mainEntries
      .filter((r) => r.status === ReceivableStatus.RECEIVED)
      .reduce((s, r) => s + r.netAmount, 0);

    const paidPayments = mainPayments
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidExtraExpenses = mainExtraExpenses
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidCreditCards = monthInvoices
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .reduce((s, inv) => s + inv.totalAmount, 0);

    // previsto — mês atual até o mês selecionado (colapsa para o próprio
    // mês quando a referência não é futura)
    const expectedIncome = rangeMainEntries.reduce((s, r) => s + r.netAmount, 0);
    const expectedPayments = rangeMainPayments.reduce((s, t) => s + t.amount, 0);
    const expectedExtraExpenses = rangeMainExtraExpenses.reduce((s, t) => s + t.amount, 0);
    const creditCardInvoicesTotal = rangeInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

    const reserveInflow = entries
      .filter((r) => r.status === ReceivableStatus.RECEIVED)
      .reduce((s, r) => {
        // Entrada com destino direto a uma conta de reserva: valor líquido inteiro vai para reserva
        if (r.targetAccountId && reserveAccountIds.has(r.targetAccountId)) return s + r.netAmount;
        // Entrada com split: apenas a soma das alocações de reserva vai para a reserva
        return s + r.reserveAmount;
      }, 0);

    const reserveOutflow = [...payments, ...extraExpenses]
      .filter(
        (t) =>
          t.status === TransactionStatus.PAID &&
          !!t.sourceAccountId &&
          reserveAccountIds.has(t.sourceAccountId),
      )
      .reduce((s, t) => s + t.amount, 0);

    return {
      month,
      year,
      entries,
      payments,
      extraExpenses,
      creditCards: monthInvoices,
      summary: {
        initialBalance,
        projectedInitialBalance,
        expectedIncome,
        receivedIncome,
        expectedPayments,
        paidPayments,
        expectedExtraExpenses,
        paidExtraExpenses,
        creditCardInvoices: creditCardInvoicesTotal,
        paidCreditCardInvoices: paidCreditCards,
        projectedBalance:
          projectedInitialBalance +
          expectedIncome -
          expectedPayments -
          expectedExtraExpenses -
          creditCardInvoicesTotal,
        realizedBalance:
          initialBalance +
          receivedIncome -
          paidPayments -
          paidExtraExpenses -
          paidCreditCards,
        reserveProjectedInitialBalance,
        reserveInflow,
        reserveOutflow,
        reserveEndBalance,
      },
    };
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  async createPayment(tenantId: string, input: CreateTransactionInput): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.PAYMENT, tenantId, input);
  }

  async updatePayment(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.PAYMENT, input, tenantId);
  }

  async deletePayment(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.PAYMENT, tenantId, scope, referenceMonth, referenceYear);
  }

  async payPayment(id: string, tenantId: string, input: PayActionInput): Promise<FinancialTransaction> {
    return this.payTransactionChecked(id, TransactionType.PAYMENT, tenantId, input);
  }

  async revertPayment(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.PAYMENT, tenantId);
  }

  // ─── Extra Expenses ───────────────────────────────────────────────────────────

  async createExtraExpense(
    tenantId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.EXTRA_EXPENSE, tenantId, input);
  }

  async updateExtraExpense(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.EXTRA_EXPENSE, input, tenantId);
  }

  async deleteExtraExpense(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId, scope, referenceMonth, referenceYear);
  }

  async payExtraExpense(
    id: string,
    tenantId: string,
    input: PayActionInput,
  ): Promise<FinancialTransaction> {
    return this.payTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId, input);
  }

  async revertExtraExpense(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId);
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async createTransaction(
    type: TransactionType,
    tenantId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    const settings = await this.settingsRepo.get(tenantId);
    const sourceAccountId =
      input.sourceAccountId ?? settings?.mainAccountId ?? null;

    const now = nowISO();
    const id = generateId();
    const recurrence = input.recurrence ?? RecurrenceType.UNIQUE;
    return this.transactionsRepo.create({
      id,
      tenantId,
      type,
      description: input.description,
      categoryId: input.categoryId,
      amount: input.amount,
      expectedDate: input.expectedDate,
      actualDate: null,
      status: TransactionStatus.PENDING,
      sourceAccountId,
      targetAccountId: null,
      originType: null,
      originId: null,
      notes: input.notes ?? null,
      recurrence,
      recurringGroupId: recurrence === RecurrenceType.FIXED ? id : null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async updateTransactionChecked(
    id: string,
    type: TransactionType,
    input: UpdateTransactionInput,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser editados.', 400);
    }
    if (tx.status === TransactionStatus.REVERSED) {
      throw new AppError('Lançamentos revertidos não podem ser editados.', 400);
    }

    let recurrencePatch: Partial<FinancialTransaction> = {};
    if (input.recurrence !== undefined && input.recurrence !== tx.recurrence) {
      if (tx.recurrence === RecurrenceType.FIXED) {
        throw new AppError(
          'Não é possível reverter um lançamento fixo para único. Use a exclusão com escopo para encerrar a recorrência.',
          400,
        );
      }
      recurrencePatch = { recurringGroupId: id, recurringActive: true };
    }

    // Para transações já pagas, a própria transação é o impacto financeiro.
    // Atualizar seus campos (amount, sourceAccountId, etc.) recalcula saldos automaticamente.
    return this.transactionsRepo.update(id, { ...input, ...recurrencePatch, updatedAt: nowISO() }, tenantId);
  }

  private async deleteTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status === TransactionStatus.PAID) {
      throw new AppError(
        'Lançamentos já pagos não podem ser excluídos. Reverta primeiro.',
        400,
      );
    }

    if (tx.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
        );
      }
      return this.deleteFixedTransaction(tx, tenantId, scope, referenceMonth, referenceYear);
    }

    await this.transactionsRepo.update(id, {
      status: TransactionStatus.CANCELED,
      updatedAt: nowISO(),
    }, tenantId);
  }

  private async deleteFixedTransaction(
    existing: FinancialTransaction,
    tenantId: string,
    scope: DeleteScope,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;
    const all = await this.transactionsRepo.findAll(tenantId);
    const group = all.filter((t) => t.recurringGroupId === groupId);

    const toCancel = group.filter((t) => {
      if (t.status !== TransactionStatus.PENDING) return false;
      const my = monthYearOf(t.expectedDate);
      const key = monthKey(my.month, my.year);
      return scope === 'CURRENT' ? key === refKey : key >= refKey;
    });

    for (const t of toCancel) {
      await this.transactionsRepo.update(t.id, { status: TransactionStatus.CANCELED, updatedAt: now }, tenantId);
    }

    if (scope === 'CURRENT_AND_FUTURE') {
      for (const t of group) {
        if (t.recurringActive) {
          await this.transactionsRepo.update(t.id, { recurringActive: false, updatedAt: now }, tenantId);
        }
      }
    }
  }

  // ─── Recorrência (lançamentos fixos) ──────────────────────────────────────────

  private async ensureFixedOccurrences(tenantId: string, targetMonth: number, targetYear: number): Promise<void> {
    await Promise.all([
      this.ensureFixedTransactions(tenantId, targetMonth, targetYear),
      this.ensureFixedReceivablesForFlow(tenantId, targetMonth, targetYear),
    ]);
  }

  private async ensureFixedTransactions(tenantId: string, targetMonth: number, targetYear: number): Promise<void> {
    const all = await this.transactionsRepo.findAll(tenantId);
    const fixed = all.filter((t) => t.recurrence === RecurrenceType.FIXED);
    if (fixed.length === 0) return;

    const groups = new Map<string, FinancialTransaction[]>();
    for (const t of fixed) {
      const gid = t.recurringGroupId ?? t.id;
      const arr = groups.get(gid) ?? [];
      arr.push(t);
      groups.set(gid, arr);
    }

    const targetKey = monthKey(targetMonth, targetYear);
    const now = nowISO();

    for (const group of groups.values()) {
      let latest = group[0];
      let anchor = group[0];
      for (const t of group) {
        if (t.expectedDate > latest.expectedDate) latest = t;
        if (t.expectedDate < anchor.expectedDate) anchor = t;
      }

      if (!latest.recurringActive) continue;

      const latestMY = monthYearOf(latest.expectedDate);
      if (monthKey(latestMY.month, latestMY.year) >= targetKey) continue;

      const anchorDay = monthYearOf(anchor.expectedDate).day;
      let cursorMonth = latestMY.month;
      let cursorYear = latestMY.year;

      while (monthKey(cursorMonth, cursorYear) < targetKey) {
        const next = addMonths(cursorMonth, cursorYear, 1, anchorDay);
        cursorMonth = next.month;
        cursorYear = next.year;

        const newDate = new Date(next.year, next.month - 1, next.day).toISOString();
        const groupId = latest.recurringGroupId ?? latest.id;

        await this.transactionsRepo.create({
          ...latest,
          id: generateId(),
          expectedDate: newDate,
          actualDate: null,
          status: TransactionStatus.PENDING,
          recurringGroupId: groupId,
          recurringActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private async ensureFixedReceivablesForFlow(tenantId: string, targetMonth: number, targetYear: number): Promise<void> {
    const all = await this.receivablesRepo.findAll(tenantId);
    const fixed = all.filter((r) => r.recurrence === RecurrenceType.FIXED);
    if (fixed.length === 0) return;

    const groups = new Map<string, typeof fixed>();
    for (const r of fixed) {
      const gid = r.recurringGroupId ?? r.id;
      const arr = groups.get(gid) ?? [];
      arr.push(r);
      groups.set(gid, arr);
    }

    const targetKey = monthKey(targetMonth, targetYear);
    const now = nowISO();

    for (const group of groups.values()) {
      let latest = group[0];
      let anchor = group[0];
      for (const r of group) {
        if (r.expectedPaymentDate > latest.expectedPaymentDate) latest = r;
        if (r.expectedPaymentDate < anchor.expectedPaymentDate) anchor = r;
      }

      if (!latest.recurringActive) continue;

      const latestMY = monthYearOf(latest.expectedPaymentDate);
      if (monthKey(latestMY.month, latestMY.year) >= targetKey) continue;

      const anchorDay = monthYearOf(anchor.expectedPaymentDate).day;
      let cursorMonth = latestMY.month;
      let cursorYear = latestMY.year;

      while (monthKey(cursorMonth, cursorYear) < targetKey) {
        const next = addMonths(cursorMonth, cursorYear, 1, anchorDay);
        cursorMonth = next.month;
        cursorYear = next.year;

        const newDate = new Date(next.year, next.month - 1, next.day).toISOString();
        const groupId = latest.recurringGroupId ?? latest.id;

        await this.receivablesRepo.create({
          ...latest,
          id: generateId(),
          expectedPaymentDate: newDate,
          actualPaymentDate: null,
          status: ReceivableStatus.EXPECTED,
          recurringGroupId: groupId,
          recurringActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private async payTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
    input: PayActionInput,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status === TransactionStatus.PAID) {
      throw new AppError('Lançamento já foi pago.', 400);
    }
    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser pagos.', 400);
    }

    const now = nowISO();
    const effectiveDate = input?.actualDate ?? tx.expectedDate;
    const amountPaid = input?.amountPaid ?? tx.amount;

    return this.transactionsRepo.update(id, {
      status: TransactionStatus.PAID,
      expectedDate: effectiveDate,
      actualDate: now,
      amount: amountPaid,
      updatedAt: now,
    }, tenantId);
  }

  private async revertTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status !== TransactionStatus.PAID) {
      throw new AppError(
        'Apenas lançamentos com status PAID podem ser revertidos.',
        400,
      );
    }

    return this.transactionsRepo.update(id, {
      status: TransactionStatus.PENDING,
      actualDate: null,
      updatedAt: nowISO(),
    }, tenantId);
  }

  private async getTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.transactionsRepo.findById(id, tenantId);
    if (!tx) throw new AppError('Lançamento não encontrado.', 404);
    if (tx.type !== type) {
      throw new AppError(
        `Lançamento não é do tipo ${type}.`,
        400,
      );
    }
    return tx;
  }

  // ─── Balance calculation ──────────────────────────────────────────────────────

  private isExcludedFromFlow(t: FinancialTransaction): boolean {
    return (
      t.status === TransactionStatus.REVERSED ||
      t.status === TransactionStatus.CANCELED
    );
  }
}
