import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, addMonths, monthKey, monthYearOf } from '../../shared/utils/date.utils';
import { applyPercentage } from '../../shared/utils/money.utils';
import { ReceivablesRepository } from './receivables.repository';
import { Receivable, ReceivableStatus, RecurrenceType } from './receivables.types';
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
import { DeleteScope } from '../../shared/types/recurrence.types';

export class ReceivablesService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  async findAll(tenantId: string, query: ReceivableQuery): Promise<Receivable[]> {
    if (query.month && query.year) {
      await this.ensureFixedOccurrences(tenantId, query.month, query.year);
      const byMonth = await this.receivablesRepo.findByMonth(tenantId, query.month, query.year);
      return query.status ? byMonth.filter((r) => r.status === query.status) : byMonth;
    }
    if (query.status) {
      return this.receivablesRepo.findByStatus(tenantId, query.status);
    }
    return this.receivablesRepo.findAll(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<Receivable> {
    const receivable = await this.receivablesRepo.findById(id, tenantId);
    if (!receivable) throw new AppError('Recebimento não encontrado', 404);
    return receivable;
  }

  async create(tenantId: string, input: CreateReceivableInput): Promise<Receivable> {
    const settings = await this.settingsRepo.get(tenantId);
    const { reservePercentage, reserveAmount, netAmount } = this.calcAmounts(
      input.grossAmount,
      input.separateReservePercentage ?? true,
      settings?.defaultReservePercentage ?? 30,
    );

    const now = nowISO();
    const id = generateId();
    const recurrence = input.recurrence ?? RecurrenceType.UNIQUE;
    return this.receivablesRepo.create({
      id,
      tenantId,
      recurrence,
      recurringGroupId: recurrence === RecurrenceType.FIXED ? id : null,
      recurringActive: true,
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
      targetAccountId: input.targetAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateReceivableInput, tenantId: string): Promise<Receivable> {
    const existing = await this.findById(id, tenantId);

    if (existing.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimentos cancelados não podem ser editados.', 400);
    }

    let recurrencePatch: Partial<Receivable> = {};
    if (input.recurrence !== undefined && input.recurrence !== existing.recurrence) {
      if (existing.recurrence === RecurrenceType.FIXED) {
        throw new AppError(
          'Não é possível reverter um lançamento fixo para único. Use a exclusão com escopo para encerrar a recorrência.',
          400,
        );
      }
      recurrencePatch = { recurringGroupId: id, recurringActive: true };
    }

    const settings = await this.settingsRepo.get(tenantId);
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
      ...recurrencePatch,
      reservePercentageApplied: reservePercentage,
      reserveAmount,
      netAmount,
      updatedAt: now,
    }, tenantId);

    if (existing.status === ReceivableStatus.RECEIVED) {
      if (!settings?.mainAccountId) {
        throw new AppError('Conta principal não configurada nas parametrizações.', 400);
      }

      // Estorna movimentações antigas
      const linked = await this.transactionsRepo.findByOrigin(tenantId, OriginType.RECEIVABLE, id);
      for (const tx of linked) {
        if (tx.status !== TransactionStatus.REVERSED) {
          await this.transactionsRepo.update(tx.id, {
            status: TransactionStatus.REVERSED,
            updatedAt: now,
          }, tenantId);
        }
      }

      const incomeTarget = updated.targetAccountId ?? settings.mainAccountId;

      // Cria nova entrada principal
      await this.transactionsRepo.create({
        id: generateId(),
        tenantId,
        type: TransactionType.INCOME,
        description: `Recebimento: ${updated.description}`,
        categoryId: updated.incomeCategoryId,
        amount: netAmount,
        expectedDate: updated.expectedPaymentDate,
        actualDate: now,
        status: TransactionStatus.RECEIVED,
        sourceAccountId: null,
        targetAccountId: incomeTarget,
        originType: OriginType.RECEIVABLE,
        originId: id,
        notes: null,
        recurrence: RecurrenceType.UNIQUE,
        recurringGroupId: null,
        recurringActive: true,
        createdAt: now,
        updatedAt: now,
      });

      // Cria nova reserva (se aplicável e destino não é a própria reserva)
      if (
        reserveAmount > 0 &&
        settings.emergencyReserveAccountId &&
        incomeTarget !== settings.emergencyReserveAccountId
      ) {
        await this.transactionsRepo.create({
          id: generateId(),
          tenantId,
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
          recurrence: RecurrenceType.UNIQUE,
          recurringGroupId: null,
          recurringActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return updated;
  }

  async delete(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (existing.status === ReceivableStatus.RECEIVED) {
      throw new AppError(
        'Recebimentos já recebidos não podem ser excluídos. Reverta primeiro.',
        400,
      );
    }

    if (existing.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
        );
      }
      return this.deleteFixedReceivable(existing, tenantId, scope, referenceMonth, referenceYear);
    }

    await this.receivablesRepo.delete(id, tenantId);
  }

  private async deleteFixedReceivable(
    existing: Receivable,
    tenantId: string,
    scope: DeleteScope,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;
    const all = await this.receivablesRepo.findAll(tenantId);
    const group = all.filter((r) => r.recurringGroupId === groupId);

    const toCancel = group.filter((r) => {
      if (r.status !== ReceivableStatus.EXPECTED) return false;
      const key = monthKey(monthYearOf(r.expectedPaymentDate).month, monthYearOf(r.expectedPaymentDate).year);
      return scope === 'CURRENT' ? key === refKey : key >= refKey;
    });

    for (const r of toCancel) {
      await this.receivablesRepo.update(r.id, { status: ReceivableStatus.CANCELED, updatedAt: now }, tenantId);
    }

    // Encerra a série (impede geração de novos meses) sem alterar histórico já passado.
    if (scope === 'CURRENT_AND_FUTURE') {
      for (const r of group) {
        if (r.recurringActive) {
          await this.receivablesRepo.update(r.id, { recurringActive: false, updatedAt: now }, tenantId);
        }
      }
    }
  }

  private async ensureFixedOccurrences(tenantId: string, targetMonth: number, targetYear: number): Promise<void> {
    const all = await this.receivablesRepo.findAll(tenantId);
    const fixed = all.filter((r) => r.recurrence === RecurrenceType.FIXED);
    if (fixed.length === 0) return;

    const groups = new Map<string, Receivable[]>();
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
        if (monthYearOf(r.expectedPaymentDate).year * 100 + monthYearOf(r.expectedPaymentDate).month >
            monthYearOf(latest.expectedPaymentDate).year * 100 + monthYearOf(latest.expectedPaymentDate).month) {
          latest = r;
        }
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

  async receive(id: string, tenantId: string, input: ReceiveActionInput): Promise<Receivable> {
    const receivable = await this.findById(id, tenantId);

    if (receivable.status === ReceivableStatus.RECEIVED) {
      throw new AppError('Recebimento já foi recebido.', 400);
    }
    if (receivable.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimento cancelado não pode ser recebido.', 400);
    }

    const settings = await this.settingsRepo.get(tenantId);
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

    const incomeTarget = receivable.targetAccountId ?? settings.mainAccountId;
    transactions.push({
      id: generateId(),
      tenantId,
      type: TransactionType.INCOME,
      description: `Recebimento: ${receivable.description}`,
      categoryId: receivable.incomeCategoryId,
      amount: receivable.netAmount,
      expectedDate: effectiveDate,
      actualDate: now,
      status: TransactionStatus.RECEIVED,
      sourceAccountId: null,
      targetAccountId: incomeTarget,
      originType: OriginType.RECEIVABLE,
      originId: receivable.id,
      notes: null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // só cria transação de reserva se o destino não for a própria conta de reserva
    if (
      receivable.reserveAmount > 0 &&
      settings.emergencyReserveAccountId &&
      incomeTarget !== settings.emergencyReserveAccountId
    ) {
      transactions.push({
        id: generateId(),
        tenantId,
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
        recurrence: RecurrenceType.UNIQUE,
        recurringGroupId: null,
        recurringActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // grava em sequência controlada
    await this.receivablesRepo.update(id, {
      status: ReceivableStatus.RECEIVED,
      actualPaymentDate: now,
      updatedAt: now,
    }, tenantId);

    for (const tx of transactions) {
      await this.transactionsRepo.create(tx);
    }

    return this.findById(id, tenantId);
  }

  async revert(id: string, tenantId: string): Promise<Receivable> {
    const receivable = await this.findById(id, tenantId);

    if (receivable.status !== ReceivableStatus.RECEIVED) {
      throw new AppError(
        'Apenas recebimentos com status RECEIVED podem ser revertidos.',
        400,
      );
    }

    const now = nowISO();

    // estorna movimentações vinculadas
    const linked = await this.transactionsRepo.findByOrigin(
      tenantId,
      OriginType.RECEIVABLE,
      id,
    );
    for (const tx of linked) {
      if (tx.status !== TransactionStatus.REVERSED) {
        await this.transactionsRepo.update(tx.id, {
          status: TransactionStatus.REVERSED,
          updatedAt: now,
        }, tenantId);
      }
    }

    // reverte o recebimento
    await this.receivablesRepo.update(id, {
      status: ReceivableStatus.EXPECTED,
      actualPaymentDate: null,
      updatedAt: now,
    }, tenantId);

    return this.findById(id, tenantId);
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
