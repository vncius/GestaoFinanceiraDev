import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, addMonths, monthKey, monthYearOf } from '../../shared/utils/date.utils';
import { calcAccountBalance } from '../../shared/utils/balance.utils';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CreditCardsRepository, CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInvoice, InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CashFlowResponse, TransferFlowItem } from './cash-flow.types';
import {
  CashFlowQuery,
  CreateTransactionInput,
  UpdateTransactionInput,
  PayActionInput,
  CreateIncomeInput,
  UpdateIncomeInput,
  ReceiveActionInput,
} from './cash-flow.schemas';
import { DeleteScope } from '../../shared/types/recurrence.types';

// Shape comum aceito pelas mutações internas (update/recorrência), coberto tanto
// por CreateTransactionInput (sourceAccountId) quanto por CreateIncomeInput (targetAccountId).
type TransactionMutationInput = {
  description?: string;
  categoryId?: string;
  amount?: number;
  expectedDate?: string;
  sourceAccountId?: string | null;
  targetAccountId?: string | null;
  notes?: string | null;
  recurrence?: RecurrenceType;
};

export class CashFlowService {
  constructor(
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly creditCardInvoicesRepo?: CreditCardInvoicesRepository,
    private readonly creditCardsRepo?: CreditCardsRepository,
  ) {}

  // ─── GET /cash-flow ──────────────────────────────────────────────────────────

  async getCashFlow(tenantId: string, query: CashFlowQuery): Promise<CashFlowResponse> {
    const { month, year, accountId } = query;

    await this.ensureFixedTransactions(tenantId, month, year);

    // Uma única leitura de cada arquivo — os filtros por mês e por intervalo
    // (usados pelas previsões) são feitos em memória sobre esses arrays,
    // em vez de buscar novamente no repositório por período.
    const [allTransactions, account, allInvoices, allCards, allAccounts] = await Promise.all([
      this.transactionsRepo.findAll(tenantId),
      this.accountsRepo.findById(accountId, tenantId),
      this.creditCardInvoicesRepo?.findAll(tenantId) ?? Promise.resolve([]),
      this.creditCardsRepo?.findAll(tenantId) ?? Promise.resolve([]),
      this.accountsRepo.findAll(tenantId),
    ]);

    if (!account) {
      throw new AppError('Conta não encontrada.', 404, 'account.notFound');
    }

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

    // Cartões continuam globais ao tenant, mas a saída de uma fatura só entra
    // no fluxo da conta que efetivamente a paga (ou pagaria, se ainda aberta).
    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const invoicePayerAccountId = (inv: CreditCardInvoice): string | null =>
      inv.paymentAccountId ?? cardMap.get(inv.creditCardId)?.defaultPaymentAccountId ?? null;
    const invoicesForAccount = allInvoices.filter((inv) => invoicePayerAccountId(inv) === accountId);

    const monthInvoices = invoicesForAccount.filter(
      (inv) => inv.status !== InvoiceStatus.CANCELED && inSelectedMonth(monthKey(inv.month, inv.year)),
    );
    const rangeInvoices = invoicesForAccount.filter(
      (inv) =>
        inv.status !== InvoiceStatus.CANCELED &&
        inv.status !== InvoiceStatus.PAID &&
        inProjectionRange(monthKey(inv.month, inv.year)),
    );

    const entries = allTransactions.filter(
      (t) =>
        t.type === TransactionType.INCOME &&
        !this.isExcludedFromFlow(t) &&
        t.targetAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangeEntries = allTransactions.filter(
      (t) =>
        t.type === TransactionType.INCOME &&
        !this.isExcludedFromFlow(t) &&
        t.targetAccountId === accountId &&
        t.status !== TransactionStatus.RECEIVED &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    const payments = allTransactions.filter(
      (t) =>
        t.type === TransactionType.PAYMENT &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangePayments = allTransactions.filter(
      (t) =>
        t.type === TransactionType.PAYMENT &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        t.status !== TransactionStatus.PAID &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    const extraExpenses = allTransactions.filter(
      (t) =>
        t.type === TransactionType.EXTRA_EXPENSE &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangeExtraExpenses = allTransactions.filter(
      (t) =>
        t.type === TransactionType.EXTRA_EXPENSE &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        t.status !== TransactionStatus.PAID &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    // Transferências (D5): cada perna aparece só no fluxo da sua própria
    // conta; a contraparte (conta e nome) vem da perna irmã via
    // transferGroupId, já que ela pertence a outra conta e não está nas
    // demais listas desta resposta.
    const accountNameById = new Map(allAccounts.map((a) => [a.id, a.name]));
    const transferLegs = allTransactions.filter(
      (t) =>
        t.type === TransactionType.TRANSFER &&
        !this.isExcludedFromFlow(t) &&
        (t.sourceAccountId === accountId || t.targetAccountId === accountId) &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const transfers: TransferFlowItem[] = transferLegs.map((leg) => {
      const sibling = allTransactions.find(
        (t) => t.transferGroupId === leg.transferGroupId && t.id !== leg.id,
      );
      const counterpartAccountId = sibling ? sibling.sourceAccountId ?? sibling.targetAccountId ?? '' : '';
      return {
        id: leg.id,
        transferGroupId: leg.transferGroupId as string,
        direction: leg.targetAccountId === accountId ? 'IN' : 'OUT',
        description: leg.description,
        amount: leg.amount,
        expectedDate: leg.expectedDate,
        actualDate: leg.actualDate,
        status: leg.status,
        notes: leg.notes,
        counterpartAccountId,
        counterpartAccountName: accountNameById.get(counterpartAccountId) ?? '—',
      };
    });

    // Somas de transferência para os totais do resumo (realizado/previsto) —
    // mantêm o invariante initialBalance_mêsSeguinte == realizedBalance_mêsAtual,
    // já que calcAccountBalance já soma transferências junto com os demais
    // tipos. Não viram campos novos em CashFlowSummary (D5 já não tem seção
    // de reserva paralela) — só entram nas somas de entrada/saída existentes.
    const transferInflowRealized = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.targetAccountId === accountId &&
          t.status === TransactionStatus.RECEIVED &&
          inSelectedMonth(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferOutflowRealized = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.sourceAccountId === accountId &&
          t.status === TransactionStatus.PAID &&
          inSelectedMonth(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferInflowExpected = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.targetAccountId === accountId &&
          t.status !== TransactionStatus.RECEIVED &&
          inProjectionRange(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferOutflowExpected = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.sourceAccountId === accountId &&
          t.status !== TransactionStatus.PAID &&
          inProjectionRange(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);

    const monthStart = new Date(year, month - 1, 1);
    // O saldo inicial da projeção só precisa ser recalculado com um corte
    // diferente (início do mês atual) quando a referência é futura; nos
    // demais casos reaproveita o mesmo saldo do mês selecionado (initialBalance).
    const rangeStart = new Date(rangeStartYear, rangeStartMonth - 1, 1);

    const initialBalance = calcAccountBalance(account, allTransactions, monthStart);
    const projectedInitialBalance = isFutureSelection
      ? calcAccountBalance(account, allTransactions, rangeStart)
      : initialBalance;

    // realizado — sempre restrito ao mês selecionado
    const receivedIncome = entries
      .filter((t) => t.status === TransactionStatus.RECEIVED)
      .reduce((s, t) => s + t.amount, 0);

    const paidPayments = payments
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidExtraExpenses = extraExpenses
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidCreditCards = monthInvoices
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .reduce((s, inv) => s + inv.totalAmount, 0);

    // previsto — mês atual até o mês selecionado (colapsa para o próprio
    // mês quando a referência não é futura)
    const expectedIncome = rangeEntries.reduce((s, t) => s + t.amount, 0);
    const expectedPayments = rangePayments.reduce((s, t) => s + t.amount, 0);
    const expectedExtraExpenses = rangeExtraExpenses.reduce((s, t) => s + t.amount, 0);
    const creditCardInvoicesTotal = rangeInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

    return {
      month,
      year,
      entries,
      payments,
      extraExpenses,
      transfers,
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
          expectedIncome +
          transferInflowExpected -
          expectedPayments -
          expectedExtraExpenses -
          creditCardInvoicesTotal -
          transferOutflowExpected,
        realizedBalance:
          initialBalance +
          receivedIncome +
          transferInflowRealized -
          paidPayments -
          paidExtraExpenses -
          paidCreditCards -
          transferOutflowRealized,
      },
    };
  }

  // ─── Income ──────────────────────────────────────────────────────────────────

  async createIncome(tenantId: string, accountId: string, input: CreateIncomeInput): Promise<FinancialTransaction> {
    const targetAccountId = input.targetAccountId ?? accountId;

    const now = nowISO();
    const id = generateId();
    const recurrence = input.recurrence ?? RecurrenceType.UNIQUE;
    return this.transactionsRepo.create({
      id,
      tenantId,
      type: TransactionType.INCOME,
      description: input.description,
      categoryId: input.categoryId,
      amount: input.amount,
      expectedDate: input.expectedDate,
      actualDate: null,
      status: TransactionStatus.PENDING,
      sourceAccountId: null,
      targetAccountId,
      originType: null,
      originId: null,
      transferGroupId: null,
      notes: input.notes ?? null,
      recurrence,
      recurringGroupId: recurrence === RecurrenceType.FIXED ? id : null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateIncome(
    id: string,
    input: UpdateIncomeInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.INCOME, input, tenantId, scope, referenceMonth, referenceYear);
  }

  async deleteIncome(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.INCOME, tenantId, scope, referenceMonth, referenceYear);
  }

  async receiveIncome(id: string, tenantId: string, input: ReceiveActionInput): Promise<FinancialTransaction> {
    return this.settleTransactionChecked(id, TransactionType.INCOME, tenantId, input?.actualDate, input?.amountReceived);
  }

  async revertIncome(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.INCOME, tenantId);
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  async createPayment(tenantId: string, accountId: string, input: CreateTransactionInput): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.PAYMENT, tenantId, accountId, input);
  }

  async updatePayment(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.PAYMENT, input, tenantId, scope, referenceMonth, referenceYear);
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
    return this.settleTransactionChecked(id, TransactionType.PAYMENT, tenantId, input?.actualDate, input?.amountPaid);
  }

  async revertPayment(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.PAYMENT, tenantId);
  }

  // ─── Extra Expenses ───────────────────────────────────────────────────────────

  async createExtraExpense(
    tenantId: string,
    accountId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.EXTRA_EXPENSE, tenantId, accountId, input);
  }

  async updateExtraExpense(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.EXTRA_EXPENSE, input, tenantId, scope, referenceMonth, referenceYear);
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
    return this.settleTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId, input?.actualDate, input?.amountPaid);
  }

  async revertExtraExpense(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId);
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async createTransaction(
    type: TransactionType,
    tenantId: string,
    accountId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    const sourceAccountId = input.sourceAccountId ?? accountId;

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
      transferGroupId: null,
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
    input: TransactionMutationInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser editados.', 400, 'transaction.canceledCannotEdit');
    }
    if (tx.status === TransactionStatus.REVERSED) {
      throw new AppError('Lançamentos revertidos não podem ser editados.', 400, 'transaction.reversedCannotEdit');
    }

    let recurrencePatch: Partial<FinancialTransaction> = {};
    if (input.recurrence !== undefined && input.recurrence !== tx.recurrence) {
      if (tx.recurrence === RecurrenceType.FIXED) {
        throw new AppError(
          'Não é possível reverter um lançamento fixo para único. Use a exclusão com escopo para encerrar a recorrência.',
          400,
          'transaction.fixedCannotRevertToUnique',
        );
      }
      recurrencePatch = { recurringGroupId: id, recurringActive: true };
    }

    if (tx.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja alterar apenas a referência atual ou também as futuras.',
          400,
          'transaction.updateScopeRequired',
        );
      }
      return this.updateFixedTransaction(tx, input, tenantId, scope, referenceMonth, referenceYear);
    }

    // Para transações já pagas, a própria transação é o impacto financeiro.
    // Atualizar seus campos (amount, sourceAccountId, etc.) recalcula saldos automaticamente.
    return this.transactionsRepo.update(id, { ...input, ...recurrencePatch, updatedAt: nowISO() }, tenantId);
  }

  private async updateFixedTransaction(
    existing: FinancialTransaction,
    input: TransactionMutationInput,
    tenantId: string,
    scope: DeleteScope,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<FinancialTransaction> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;

    const updated = await this.transactionsRepo.update(existing.id, { ...input, updatedAt: now }, tenantId);

    if (scope === 'CURRENT_AND_FUTURE') {
      // A data de cada ocorrência é individual — apenas os demais campos
      // (valor, descrição, categoria, conta, notas) se propagam para as futuras.
      const { expectedDate: _expectedDate, ...seriesPatch } = input;
      const all = await this.transactionsRepo.findAll(tenantId);
      const futureOccurrences = all.filter((t) => {
        if (t.id === existing.id || t.recurringGroupId !== groupId) return false;
        if (t.status !== TransactionStatus.PENDING) return false;
        const my = monthYearOf(t.expectedDate);
        return monthKey(my.month, my.year) > refKey;
      });
      for (const t of futureOccurrences) {
        await this.transactionsRepo.update(t.id, { ...seriesPatch, updatedAt: now }, tenantId);
      }
    }

    return updated;
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

    if (tx.status === this.settledStatus(type)) {
      throw new AppError(
        type === TransactionType.INCOME
          ? 'Lançamentos já recebidos não podem ser excluídos. Reverta primeiro.'
          : 'Lançamentos já pagos não podem ser excluídos. Reverta primeiro.',
        400,
        'transaction.settledCannotDelete',
      );
    }

    if (tx.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
          'transaction.deleteScopeRequired',
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

  // Agnóstico ao TransactionType — materializa recorrência fixa de PAYMENT,
  // EXTRA_EXPENSE e INCOME igualmente, já que todos compartilham recurringGroupId/recurringActive.
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

  // Status "concluído" varia por tipo: INCOME vira RECEIVED (espelha Receivable),
  // os demais tipos viram PAID.
  private settledStatus(type: TransactionType): TransactionStatus {
    return type === TransactionType.INCOME ? TransactionStatus.RECEIVED : TransactionStatus.PAID;
  }

  private async settleTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
    actualDate?: string,
    settledAmount?: number,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);
    const isIncome = type === TransactionType.INCOME;

    if (tx.status === this.settledStatus(type)) {
      throw new AppError(
        isIncome ? 'Lançamento já foi recebido.' : 'Lançamento já foi pago.',
        400,
        'transaction.alreadySettled',
      );
    }
    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError(
        isIncome ? 'Lançamentos cancelados não podem ser recebidos.' : 'Lançamentos cancelados não podem ser pagos.',
        400,
        'transaction.canceledCannotSettle',
      );
    }

    const now = nowISO();
    const effectiveDate = actualDate ?? tx.expectedDate;
    const amount = settledAmount ?? tx.amount;

    return this.transactionsRepo.update(id, {
      status: this.settledStatus(type),
      expectedDate: effectiveDate,
      actualDate: now,
      amount,
      updatedAt: now,
    }, tenantId);
  }

  private async revertTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status !== this.settledStatus(type)) {
      throw new AppError(
        type === TransactionType.INCOME
          ? 'Apenas lançamentos com status RECEIVED podem ser revertidos.'
          : 'Apenas lançamentos com status PAID podem ser revertidos.',
        400,
        'transaction.notSettledCannotRevert',
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
    if (!tx) throw new AppError('Lançamento não encontrado.', 404, 'transaction.notFound');
    if (tx.type !== type) {
      throw new AppError(
        `Lançamento não é do tipo ${type}.`,
        400,
        'transaction.wrongType',
        { type },
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
