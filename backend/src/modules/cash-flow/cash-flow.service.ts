import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
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
import { CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CashFlowResponse } from './cash-flow.types';
import {
  CashFlowQuery,
  CreateTransactionInput,
  UpdateTransactionInput,
  PayActionInput,
} from './cash-flow.schemas';

export class CashFlowService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly creditCardInvoicesRepo?: CreditCardInvoicesRepository,
  ) {}

  // ─── GET /cash-flow ──────────────────────────────────────────────────────────

  async getCashFlow(query: CashFlowQuery): Promise<CashFlowResponse> {
    const { month, year } = query;

    const [receivablesForMonth, transactionsForMonth, allTransactions, settings, allInvoices] =
      await Promise.all([
        this.receivablesRepo.findByMonth(month, year),
        this.transactionsRepo.findByMonth(month, year),
        this.transactionsRepo.findAll(),
        this.settingsRepo.get(),
        this.creditCardInvoicesRepo?.findAll() ?? Promise.resolve([]),
      ]);

    const monthInvoices = allInvoices.filter(
      (inv) =>
        inv.month === month &&
        inv.year === year &&
        inv.status !== InvoiceStatus.CANCELED,
    );

    const entries = receivablesForMonth.filter(
      (r) => r.status !== ReceivableStatus.CANCELED,
    );

    const payments = transactionsForMonth.filter(
      (t) =>
        t.type === TransactionType.PAYMENT && !this.isExcludedFromFlow(t),
    );

    const extraExpenses = transactionsForMonth.filter(
      (t) =>
        t.type === TransactionType.EXTRA_EXPENSE && !this.isExcludedFromFlow(t),
    );

    const monthStart = new Date(year, month - 1, 1);
    const mainId = settings?.mainAccountId ?? null;
    const reserveId = settings?.emergencyReserveAccountId ?? null;

    const [mainAccountBalance, reserveBalance, initialBalance] =
      await Promise.all([
        mainId ? this.calcAccountBalance(mainId, allTransactions) : 0,
        reserveId ? this.calcAccountBalance(reserveId, allTransactions) : 0,
        mainId
          ? this.calcAccountBalance(mainId, allTransactions, monthStart)
          : 0,
      ]);

    // totais do mês
    const expectedIncome = entries.reduce((s, r) => s + r.netAmount, 0);
    const receivedIncome = entries
      .filter((r) => r.status === ReceivableStatus.RECEIVED)
      .reduce((s, r) => s + r.netAmount, 0);

    const expectedPayments = payments.reduce((s, t) => s + t.amount, 0);
    const paidPayments = payments
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const expectedExtraExpenses = extraExpenses.reduce((s, t) => s + t.amount, 0);
    const paidExtraExpenses = extraExpenses
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const creditCardInvoicesTotal = monthInvoices.reduce(
      (s, inv) => s + inv.totalAmount,
      0,
    );
    const paidCreditCards = monthInvoices
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .reduce((s, inv) => s + inv.totalAmount, 0);

    return {
      month,
      year,
      entries,
      payments,
      extraExpenses,
      creditCards: monthInvoices,
      summary: {
        initialBalance,
        expectedIncome,
        receivedIncome,
        expectedPayments,
        paidPayments,
        expectedExtraExpenses,
        paidExtraExpenses,
        creditCardInvoices: creditCardInvoicesTotal,
        projectedBalance:
          initialBalance +
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
        mainAccountBalance,
        emergencyReserveBalance: reserveBalance,
      },
    };
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  async createPayment(input: CreateTransactionInput): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.PAYMENT, input);
  }

  async updatePayment(
    id: string,
    input: UpdateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.PAYMENT, input);
  }

  async deletePayment(id: string): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.PAYMENT);
  }

  async payPayment(id: string, input: PayActionInput): Promise<FinancialTransaction> {
    return this.payTransactionChecked(id, TransactionType.PAYMENT, input);
  }

  async revertPayment(id: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.PAYMENT);
  }

  // ─── Extra Expenses ───────────────────────────────────────────────────────────

  async createExtraExpense(
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.EXTRA_EXPENSE, input);
  }

  async updateExtraExpense(
    id: string,
    input: UpdateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.EXTRA_EXPENSE, input);
  }

  async deleteExtraExpense(id: string): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.EXTRA_EXPENSE);
  }

  async payExtraExpense(
    id: string,
    input: PayActionInput,
  ): Promise<FinancialTransaction> {
    return this.payTransactionChecked(id, TransactionType.EXTRA_EXPENSE, input);
  }

  async revertExtraExpense(id: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.EXTRA_EXPENSE);
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async createTransaction(
    type: TransactionType,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    const settings = await this.settingsRepo.get();
    const sourceAccountId =
      input.sourceAccountId ?? settings?.mainAccountId ?? null;

    const now = nowISO();
    return this.transactionsRepo.create({
      id: generateId(),
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
      createdAt: now,
      updatedAt: now,
    });
  }

  private async updateTransactionChecked(
    id: string,
    type: TransactionType,
    input: UpdateTransactionInput,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type);

    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser editados.', 400);
    }
    if (tx.status === TransactionStatus.REVERSED) {
      throw new AppError('Lançamentos revertidos não podem ser editados.', 400);
    }

    // Para transações já pagas, a própria transação é o impacto financeiro.
    // Atualizar seus campos (amount, sourceAccountId, etc.) recalcula saldos automaticamente.
    return this.transactionsRepo.update(id, { ...input, updatedAt: nowISO() });
  }

  private async deleteTransactionChecked(
    id: string,
    type: TransactionType,
  ): Promise<void> {
    const tx = await this.getTransactionChecked(id, type);

    if (tx.status === TransactionStatus.PAID) {
      throw new AppError(
        'Lançamentos já pagos não podem ser excluídos. Reverta primeiro.',
        400,
      );
    }

    await this.transactionsRepo.update(id, {
      status: TransactionStatus.CANCELED,
      updatedAt: nowISO(),
    });
  }

  private async payTransactionChecked(
    id: string,
    type: TransactionType,
    input: PayActionInput,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type);

    if (tx.status === TransactionStatus.PAID) {
      throw new AppError('Lançamento já foi pago.', 400);
    }
    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser pagos.', 400);
    }

    const now = nowISO();
    const actualDate = input?.actualDate ?? now;
    const amountPaid = input?.amountPaid ?? tx.amount;

    return this.transactionsRepo.update(id, {
      status: TransactionStatus.PAID,
      actualDate,
      amount: amountPaid,
      updatedAt: now,
    });
  }

  private async revertTransactionChecked(
    id: string,
    type: TransactionType,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type);

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
    });
  }

  private async getTransactionChecked(
    id: string,
    type: TransactionType,
  ): Promise<FinancialTransaction> {
    const tx = await this.transactionsRepo.findById(id);
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

  private async calcAccountBalance(
    accountId: string,
    transactions: FinancialTransaction[],
    beforeDate?: Date,
  ): Promise<number> {
    const account = await this.accountsRepo.findById(accountId);
    if (!account) return 0;

    let balance = account.initialBalance;

    const confirmed = transactions.filter((t) => {
      const isConfirmed =
        t.status === TransactionStatus.RECEIVED ||
        t.status === TransactionStatus.PAID;
      if (!isConfirmed) return false;
      if (beforeDate) {
        const txDate = new Date(t.actualDate ?? t.expectedDate);
        return txDate < beforeDate;
      }
      return true;
    });

    balance += confirmed
      .filter((t) => t.targetAccountId === accountId)
      .reduce((s, t) => s + t.amount, 0);

    balance -= confirmed
      .filter((t) => t.sourceAccountId === accountId)
      .reduce((s, t) => s + t.amount, 0);

    return balance;
  }

  private isExcludedFromFlow(t: FinancialTransaction): boolean {
    return (
      t.status === TransactionStatus.REVERSED ||
      t.status === TransactionStatus.CANCELED
    );
  }
}
