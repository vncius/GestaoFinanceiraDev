import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, addMonths, monthKey, monthYearOf } from '../../shared/utils/date.utils';
import { applyPercentage } from '../../shared/utils/money.utils';
import { ReceivablesRepository } from './receivables.repository';
import { Receivable, ReceivableStatus, RecurrenceType, ReserveAllocation } from './receivables.types';
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
import { AccountsRepository } from '../accounts/accounts.repository';
import { DeleteScope } from '../../shared/types/recurrence.types';

export class ReceivablesService {
  constructor(
    private readonly receivablesRepo: ReceivablesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly accountsRepo: AccountsRepository,
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
    if (!receivable) throw new AppError('Recebimento não encontrado', 404, 'receivable.notFound');
    return receivable;
  }

  async create(tenantId: string, input: CreateReceivableInput): Promise<Receivable> {
    const { reserveAllocations, reserveAmount, netAmount } = await this.calcReserveAllocations(
      tenantId,
      input.grossAmount,
      input.reserveAccountIds ?? [],
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
      reserveAllocations,
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

  async update(
    id: string,
    input: UpdateReceivableInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<Receivable> {
    const existing = await this.findById(id, tenantId);

    if (existing.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimentos cancelados não podem ser editados.', 400, 'receivable.canceledCannotEdit');
    }

    let recurrencePatch: Partial<Receivable> = {};
    if (input.recurrence !== undefined && input.recurrence !== existing.recurrence) {
      if (existing.recurrence === RecurrenceType.FIXED) {
        throw new AppError(
          'Não é possível reverter um lançamento fixo para único. Use a exclusão com escopo para encerrar a recorrência.',
          400,
          'receivable.fixedCannotRevertToUnique',
        );
      }
      recurrencePatch = { recurringGroupId: id, recurringActive: true };
    }

    if (existing.recurrence === RecurrenceType.FIXED && (!scope || !referenceMonth || !referenceYear)) {
      throw new AppError(
        'Informe se deseja alterar apenas a referência atual ou também as futuras.',
        400,
        'receivable.updateScopeRequired',
      );
    }

    const grossAmount = input.grossAmount ?? existing.grossAmount;
    const reserveAccountIds =
      input.reserveAccountIds ?? (existing.reserveAllocations ?? []).map((a) => a.accountId);

    const { reserveAllocations, reserveAmount, netAmount } = await this.calcReserveAllocations(
      tenantId,
      grossAmount,
      reserveAccountIds,
    );

    const now = nowISO();

    const updated = await this.receivablesRepo.update(id, {
      ...input,
      ...recurrencePatch,
      reserveAllocations,
      reserveAmount,
      netAmount,
      updatedAt: now,
    }, tenantId);

    if (existing.status === ReceivableStatus.RECEIVED) {
      const settings = await this.settingsRepo.get(tenantId);
      if (!settings?.mainAccountId) {
        throw new AppError('Conta principal não configurada nas parametrizações.', 400, 'receivable.mainAccountNotConfigured');
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

      // Cria as novas reservas (uma por conta configurada, exceto a própria conta de destino)
      for (const allocation of reserveAllocations) {
        if (allocation.amount <= 0 || allocation.accountId === incomeTarget) continue;
        await this.transactionsRepo.create({
          id: generateId(),
          tenantId,
          type: TransactionType.RESERVE,
          description: `Reserva: ${updated.description}`,
          categoryId: null,
          amount: allocation.amount,
          expectedDate: updated.expectedPaymentDate,
          actualDate: now,
          status: TransactionStatus.RECEIVED,
          sourceAccountId: null,
          targetAccountId: allocation.accountId,
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

    if (existing.recurrence === RecurrenceType.FIXED && scope === 'CURRENT_AND_FUTURE') {
      await this.propagateFixedReceivableUpdate(existing, input, tenantId, referenceMonth!, referenceYear!);
    }

    return updated;
  }

  private async propagateFixedReceivableUpdate(
    existing: Receivable,
    input: UpdateReceivableInput,
    tenantId: string,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;
    // A data de cada ocorrência é individual — apenas os demais campos
    // (valor, descrição, categoria, contas, notas) se propagam para as futuras.
    const { expectedPaymentDate: _expectedPaymentDate, ...seriesPatch } = input;

    const all = await this.receivablesRepo.findAll(tenantId);
    const futureOccurrences = all.filter((r) => {
      if (r.id === existing.id || r.recurringGroupId !== groupId) return false;
      if (r.status !== ReceivableStatus.EXPECTED) return false;
      const my = monthYearOf(r.expectedPaymentDate);
      return monthKey(my.month, my.year) > refKey;
    });

    for (const r of futureOccurrences) {
      const grossAmount = seriesPatch.grossAmount ?? r.grossAmount;
      const reserveAccountIds = seriesPatch.reserveAccountIds ?? (r.reserveAllocations ?? []).map((a) => a.accountId);
      const { reserveAllocations, reserveAmount, netAmount } = await this.calcReserveAllocations(
        tenantId,
        grossAmount,
        reserveAccountIds,
      );
      await this.receivablesRepo.update(r.id, {
        ...seriesPatch,
        reserveAllocations,
        reserveAmount,
        netAmount,
        updatedAt: now,
      }, tenantId);
    }
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
        'receivable.alreadyReceivedCannotDelete',
      );
    }

    // Um item já cancelado não tem mais nada "EXPECTED" para aplicar escopo
    // (deleteFixedReceivable seria um no-op) — remove a linha de fato para
    // não deixar registro fantasma preso na lista sem nenhuma ação possível.
    if (existing.status === ReceivableStatus.CANCELED) {
      await this.receivablesRepo.delete(id, tenantId);
      return;
    }

    if (existing.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
          'receivable.deleteScopeRequired',
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
      throw new AppError('Recebimento já foi recebido.', 400, 'receivable.alreadyReceived');
    }
    if (receivable.status === ReceivableStatus.CANCELED) {
      throw new AppError('Recebimento cancelado não pode ser recebido.', 400, 'receivable.canceledCannotReceive');
    }

    const settings = await this.settingsRepo.get(tenantId);
    if (!settings?.mainAccountId) {
      throw new AppError(
        'Conta principal não configurada nas parametrizações.',
        400,
        'receivable.mainAccountNotConfigured',
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

    // cria uma transação RESERVE por conta configurada, exceto a própria conta de destino
    for (const allocation of receivable.reserveAllocations ?? []) {
      if (allocation.amount <= 0 || allocation.accountId === incomeTarget) continue;
      transactions.push({
        id: generateId(),
        tenantId,
        type: TransactionType.RESERVE,
        description: `Reserva: ${receivable.description}`,
        categoryId: null,
        amount: allocation.amount,
        expectedDate: effectiveDate,
        actualDate: now,
        status: TransactionStatus.RECEIVED,
        sourceAccountId: null,
        targetAccountId: allocation.accountId,
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
        'receivable.notReceivedCannotRevert',
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

  private async calcReserveAllocations(
    tenantId: string,
    grossAmount: number,
    reserveAccountIds: string[],
  ): Promise<{ reserveAllocations: ReserveAllocation[]; reserveAmount: number; netAmount: number }> {
    if (reserveAccountIds.length === 0) {
      return { reserveAllocations: [], reserveAmount: 0, netAmount: grossAmount };
    }

    const accounts = await this.accountsRepo.findActive(tenantId);
    const eligibleIds = new Set(reserveAccountIds);
    const reserveAllocations: ReserveAllocation[] = accounts
      .filter((a) => a.autoReserveEnabled && eligibleIds.has(a.id))
      .map((a) => ({
        accountId: a.id,
        percentage: a.autoReservePercentage,
        amount: applyPercentage(grossAmount, a.autoReservePercentage),
      }));

    const reserveAmount = reserveAllocations.reduce((s, a) => s + a.amount, 0);
    const netAmount = grossAmount - reserveAmount;
    return { reserveAllocations, reserveAmount, netAmount };
  }
}
