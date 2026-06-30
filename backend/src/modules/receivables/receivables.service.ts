import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { applyPercentage } from '../../shared/utils/money.utils';
import { ReceivablesRepository } from './receivables.repository';
import { Receivable, ReceivableStatus } from './receivables.types';
import {
  CreateReceivableInput,
  UpdateReceivableInput,
  ReceivableQuery,
  ReceiveActionInput,
} from './receivables.schemas';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { SettingsRepository } from '../settings/settings.repository';

export class ReceivablesService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  async findAll(query: ReceivableQuery): Promise<Receivable[]> {
    if (query.month && query.year) {
      const byMonth = await this.receivablesRepo.findByMonth(query.month, query.year);
      return query.status ? byMonth.filter((r) => r.status === query.status) : byMonth;
    }
    if (query.status) {
      return this.receivablesRepo.findByStatus(query.status);
    }
    return this.receivablesRepo.findAll();
  }

  async findById(id: string): Promise<Receivable> {
    const receivable = await this.receivablesRepo.findById(id);
    if (!receivable) throw new AppError('Recebimento não encontrado', 404);
    return receivable;
  }

  async create(input: CreateReceivableInput): Promise<Receivable> {
    const settings = await this.settingsRepo.get();
    const { reservePercentage, reserveAmount, netAmount } = this.calcAmounts(
      input.grossAmount,
      input.separateReservePercentage ?? true,
      settings?.defaultReservePercentage ?? 30,
    );

    const now = nowISO();
    return this.receivablesRepo.create({
      id: generateId(),
      description: input.description,
      expectedPaymentDate: input.expectedPaymentDate,
      actualPaymentDate: null,
      grossAmount: input.grossAmount,
      separateReservePercentage: input.separateReservePercentage ?? true,
      reservePercentageApplied: reservePercentage,
      reserveAmount,
      netAmount,
      status: ReceivableStatus.EXPECTED,
      incomeCategoryId: input.incomeCategoryId,
      notes: input.notes ?? null,
      customerName: input.customerName ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceCode: input.invoiceCode ?? null,
      invoiceLink: input.invoiceLink ?? null,
      invoiceIssueDate: input.invoiceIssueDate ?? null,
      competence: input.competence ?? null,
      workedHours: input.workedHours ?? null,
      hourlyRate: input.hourlyRate ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateReceivableInput): Promise<Receivable> {
    const existing = await this.findById(id);

    if (existing.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimentos cancelados não podem ser editados.', 400);
    }

    const settings = await this.settingsRepo.get();
    const grossAmount = input.grossAmount ?? existing.grossAmount;
    const separateReserve =
      input.separateReservePercentage ?? existing.separateReservePercentage;

    const { reservePercentage, reserveAmount, netAmount } = this.calcAmounts(
      grossAmount,
      separateReserve,
      settings?.defaultReservePercentage ?? 30,
    );

    const now = nowISO();

    const updated = await this.receivablesRepo.update(id, {
      ...input,
      reservePercentageApplied: reservePercentage,
      reserveAmount,
      netAmount,
      updatedAt: now,
    });

    if (existing.status === ReceivableStatus.RECEIVED) {
      if (!settings?.mainAccountId) {
        throw new AppError('Conta principal não configurada nas parametrizações.', 400);
      }

      // Estorna movimentações antigas
      const linked = await this.transactionsRepo.findByOrigin(OriginType.RECEIVABLE, id);
      for (const tx of linked) {
        if (tx.status !== TransactionStatus.REVERSED) {
          await this.transactionsRepo.update(tx.id, {
            status: TransactionStatus.REVERSED,
            updatedAt: now,
          });
        }
      }

      // Cria nova entrada principal
      await this.transactionsRepo.create({
        id: generateId(),
        type: TransactionType.INCOME,
        description: `Recebimento: ${updated.description}`,
        categoryId: updated.incomeCategoryId,
        amount: netAmount,
        expectedDate: updated.expectedPaymentDate,
        actualDate: now,
        status: TransactionStatus.RECEIVED,
        sourceAccountId: null,
        targetAccountId: settings.mainAccountId,
        originType: OriginType.RECEIVABLE,
        originId: id,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });

      // Cria nova reserva (se aplicável)
      if (reserveAmount > 0 && settings.emergencyReserveAccountId) {
        await this.transactionsRepo.create({
          id: generateId(),
          type: TransactionType.RESERVE,
          description: `Reserva: ${updated.description}`,
          categoryId: null,
          amount: reserveAmount,
          expectedDate: updated.expectedPaymentDate,
          actualDate: now,
          status: TransactionStatus.RECEIVED,
          sourceAccountId: null,
          targetAccountId: settings.emergencyReserveAccountId,
          originType: OriginType.RECEIVABLE,
          originId: id,
          notes: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.status === ReceivableStatus.RECEIVED) {
      throw new AppError(
        'Recebimentos já recebidos não podem ser excluídos. Reverta primeiro.',
        400,
      );
    }
    await this.receivablesRepo.delete(id);
  }

  async receive(id: string, input: ReceiveActionInput): Promise<Receivable> {
    const receivable = await this.findById(id);

    if (receivable.status === ReceivableStatus.RECEIVED) {
      throw new AppError('Recebimento já foi recebido.', 400);
    }
    if (receivable.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimento cancelado não pode ser recebido.', 400);
    }

    const settings = await this.settingsRepo.get();
    if (!settings?.mainAccountId) {
      throw new AppError(
        'Conta principal não configurada nas parametrizações.',
        400,
      );
    }

    const now = nowISO();
    const effectiveDate = input?.actualPaymentDate ?? receivable.expectedPaymentDate;

    // prepara as movimentações antes de gravar qualquer coisa
    const transactions: FinancialTransaction[] = [];

    transactions.push({
      id: generateId(),
      type: TransactionType.INCOME,
      description: `Recebimento: ${receivable.description}`,
      categoryId: receivable.incomeCategoryId,
      amount: receivable.netAmount,
      expectedDate: effectiveDate,
      actualDate: now,
      status: TransactionStatus.RECEIVED,
      sourceAccountId: null,
      targetAccountId: settings.mainAccountId,
      originType: OriginType.RECEIVABLE,
      originId: receivable.id,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    if (receivable.reserveAmount > 0 && settings.emergencyReserveAccountId) {
      transactions.push({
        id: generateId(),
        type: TransactionType.RESERVE,
        description: `Reserva: ${receivable.description}`,
        categoryId: null,
        amount: receivable.reserveAmount,
        expectedDate: effectiveDate,
        actualDate: now,
        status: TransactionStatus.RECEIVED,
        sourceAccountId: null,
        targetAccountId: settings.emergencyReserveAccountId,
        originType: OriginType.RECEIVABLE,
        originId: receivable.id,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // grava em sequência controlada
    await this.receivablesRepo.update(id, {
      status: ReceivableStatus.RECEIVED,
      actualPaymentDate: now,
      updatedAt: now,
    });

    for (const tx of transactions) {
      await this.transactionsRepo.create(tx);
    }

    return this.findById(id);
  }

  async revert(id: string): Promise<Receivable> {
    const receivable = await this.findById(id);

    if (receivable.status !== ReceivableStatus.RECEIVED) {
      throw new AppError(
        'Apenas recebimentos com status RECEIVED podem ser revertidos.',
        400,
      );
    }

    const now = nowISO();

    // estorna movimentações vinculadas
    const linked = await this.transactionsRepo.findByOrigin(
      OriginType.RECEIVABLE,
      id,
    );
    for (const tx of linked) {
      if (tx.status !== TransactionStatus.REVERSED) {
        await this.transactionsRepo.update(tx.id, {
          status: TransactionStatus.REVERSED,
          updatedAt: now,
        });
      }
    }

    // reverte o recebimento
    await this.receivablesRepo.update(id, {
      status: ReceivableStatus.EXPECTED,
      actualPaymentDate: null,
      updatedAt: now,
    });

    return this.findById(id);
  }

  // --- helpers ---

  private calcAmounts(
    grossAmount: number,
    separateReserve: boolean,
    defaultPercentage: number,
  ) {
    if (!separateReserve) {
      return { reservePercentage: 0, reserveAmount: 0, netAmount: grossAmount };
    }
    const reservePercentage = defaultPercentage;
    const reserveAmount = applyPercentage(grossAmount, reservePercentage);
    const netAmount = grossAmount - reserveAmount;
    return { reservePercentage, reserveAmount, netAmount };
  }
}
