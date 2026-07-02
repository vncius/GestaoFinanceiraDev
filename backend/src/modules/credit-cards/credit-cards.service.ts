import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from '../settings/settings.repository';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  OriginType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import {
  CreditCardsRepository,
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from './credit-cards.repository';
import {
  CardEntryType,
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
  InstallmentStatus,
  InvoiceStatus,
} from './credit-cards.types';
import {
  CreateCardEntryInput,
  CreateCreditCardInput,
  PayInvoiceInput,
  UpdateCardEntryInput,
  UpdateCreditCardInput,
} from './credit-cards.schemas';

export interface CreditCardWithSummary extends CreditCard {
  currentMonth: number;
  currentYear: number;
  currentInvoice: CreditCardInvoice | null;
  currentMonthAmount: number;
  totalOpenAmount: number;
  totalFutureAmount: number;
}

export interface CardFlowResponse {
  card: CreditCard;
  month: number;
  year: number;
  invoice: CreditCardInvoice | null;
  installments: CreditCardInstallment[];
  entries: CreditCardEntry[];
  summary: {
    invoiceTotal: number;
    paidAmount: number;
    openAmount: number;
  };
}

export class CreditCardsService {
  constructor(
    private readonly cardsRepo: CreditCardsRepository,
    private readonly entriesRepo: CreditCardEntriesRepository,
    private readonly installmentsRepo: CreditCardInstallmentsRepository,
    private readonly invoicesRepo: CreditCardInvoicesRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  // ─── Cards CRUD ───────────────────────────────────────────────────────────────

  async findAll(month?: number, year?: number): Promise<CreditCardWithSummary[]> {
    const [cards, allEntries] = await Promise.all([
      this.cardsRepo.findActive(),
      this.entriesRepo.findAll(),
    ]);

    const now = new Date();
    const currentMonth = month ?? (now.getMonth() + 1);
    const currentYear = year ?? now.getFullYear();

    for (const card of cards) {
      const fixedEntries = allEntries.filter(
        (e) => e.creditCardId === card.id && e.active && e.entryType === CardEntryType.FIXED,
      );
      for (const entry of fixedEntries) {
        await this.ensureFixedInstallments(entry, card, currentMonth, currentYear);
      }
    }

    const [allInstallments, allInvoices] = await Promise.all([
      this.installmentsRepo.findAll(),
      this.invoicesRepo.findAll(),
    ]);

    return cards.map((card) => {
      const cardEntries = allEntries.filter(
        (e) => e.creditCardId === card.id && e.active,
      );
      const entryIds = new Set(cardEntries.map((e) => e.id));
      const cardInstallments = allInstallments.filter(
        (i) =>
          entryIds.has(i.creditCardEntryId) &&
          i.status !== InstallmentStatus.CANCELED,
      );
      const currentInvoice =
        allInvoices.find(
          (inv) =>
            inv.creditCardId === card.id &&
            inv.month === currentMonth &&
            inv.year === currentYear,
        ) ?? null;

      const totalOpenAmount = cardInstallments
        .filter((i) => i.status === InstallmentStatus.OPEN)
        .reduce((s, i) => s + i.amount, 0);

      const totalFutureAmount = cardInstallments
        .filter((i) => {
          if (i.status !== InstallmentStatus.OPEN) return false;
          return (
            i.year > currentYear ||
            (i.year === currentYear && i.month > currentMonth)
          );
        })
        .reduce((s, i) => s + i.amount, 0);

      return {
        ...card,
        currentMonth,
        currentYear,
        currentInvoice,
        currentMonthAmount: currentInvoice?.totalAmount ?? 0,
        totalOpenAmount,
        totalFutureAmount,
      };
    });
  }

  async findById(id: string): Promise<CreditCard> {
    const card = await this.cardsRepo.findById(id);
    if (!card) throw new AppError('Cartão não encontrado.', 404);
    if (!card.active) throw new AppError('Cartão inativo.', 400);
    return card;
  }

  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    const now = nowISO();
    return this.cardsRepo.create({
      id: generateId(),
      name: input.name,
      bank: input.bank,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      limit: input.limit,
      defaultPaymentAccountId: input.defaultPaymentAccountId ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateCreditCardInput): Promise<CreditCard> {
    await this.findById(id);
    return this.cardsRepo.update(id, { ...input, updatedAt: nowISO() });
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.cardsRepo.update(id, { active: false, updatedAt: nowISO() });
  }

  // ─── Card flow ────────────────────────────────────────────────────────────────

  async getCardFlow(
    cardId: string,
    month: number,
    year: number,
  ): Promise<CardFlowResponse> {
    const card = await this.findById(cardId);

    const allEntries = await this.entriesRepo.findByCardId(cardId);
    const fixedEntries = allEntries.filter(
      (e) => e.active && e.entryType === CardEntryType.FIXED,
    );
    for (const entry of fixedEntries) {
      await this.ensureFixedInstallments(entry, card, month, year);
    }

    const [invoice, installments] = await Promise.all([
      this.invoicesRepo.findByCardAndMonth(cardId, month, year),
      this.installmentsRepo.findByCardAndMonth(cardId, month, year),
    ]);

    const active = installments.filter(
      (i) => i.status !== InstallmentStatus.CANCELED,
    );

    const entryIds = new Set(active.map((i) => i.creditCardEntryId));
    const entries = allEntries.filter((e) => entryIds.has(e.id));

    const invoiceTotal = active.reduce((s, i) => s + i.amount, 0);
    const paidAmount = active
      .filter((i) => i.status === InstallmentStatus.PAID)
      .reduce((s, i) => s + i.amount, 0);

    return {
      card,
      month,
      year,
      invoice: invoice ?? null,
      installments: active,
      entries,
      summary: {
        invoiceTotal,
        paidAmount,
        openAmount: invoiceTotal - paidAmount,
      },
    };
  }

  // ─── Entries ──────────────────────────────────────────────────────────────────

  async createEntry(
    cardId: string,
    input: CreateCardEntryInput,
  ): Promise<{ entry: CreditCardEntry; installments: CreditCardInstallment[] }> {
    const card = await this.findById(cardId);

    const firstMonth = this.getInvoiceMonth(input.purchaseDate, card.closingDay);

    let count: number;
    if (input.entryType === CardEntryType.CASH) {
      count = 1;
    } else if (input.entryType === CardEntryType.FIXED) {
      // Fixo é recorrente por tempo indeterminado: cria apenas a referência
      // inicial aqui; as demais são geradas sob demanda (ver ensureFixedInstallments).
      count = 1;
    } else {
      count = input.installmentsCount!;
    }

    const base = Math.floor(input.totalAmount / count);
    const remainder = input.totalAmount - base * count;

    const now = nowISO();
    const entry = await this.entriesRepo.create({
      id: generateId(),
      creditCardId: cardId,
      description: input.description,
      expenseCategoryId: input.expenseCategoryId,
      totalAmount: input.totalAmount,
      purchaseDate: input.purchaseDate,
      entryType: input.entryType,
      installmentsCount: count,
      closingDayUsed: card.closingDay,
      notes: input.notes ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const createdInstallments: CreditCardInstallment[] = [];

    for (let i = 0; i < count; i++) {
      const { month, year } = this.addMonths(
        firstMonth.month,
        firstMonth.year,
        i,
      );
      const amount = base + (i === 0 ? remainder : 0);
      const invoice = await this.findOrCreateInvoice(
        cardId,
        month,
        year,
        card.dueDay,
      );

      const installment = await this.installmentsRepo.create({
        id: generateId(),
        creditCardEntryId: entry.id,
        installmentNumber: i + 1,
        totalInstallments: count,
        amount,
        month,
        year,
        status: InstallmentStatus.OPEN,
        creditCardInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
      });

      createdInstallments.push(installment);
      await this.recalcInvoiceTotal(invoice.id);
    }

    if (entry.entryType === CardEntryType.FIXED) {
      const nowDate = new Date();
      await this.ensureFixedInstallments(entry, card, nowDate.getMonth() + 1, nowDate.getFullYear());
    }

    return { entry, installments: createdInstallments };
  }

  async updateEntry(
    cardId: string,
    entryId: string,
    input: UpdateCardEntryInput,
  ): Promise<CreditCardEntry> {
    const entry = await this.getEntryChecked(cardId, entryId);
    if (!entry.active) throw new AppError('Lançamento inativo.', 400);

    const now = nowISO();

    const needsRecreate =
      (input.totalAmount !== undefined && input.totalAmount !== entry.totalAmount) ||
      (input.purchaseDate !== undefined && input.purchaseDate !== entry.purchaseDate) ||
      (input.entryType !== undefined && input.entryType !== entry.entryType) ||
      (input.installmentsCount !== undefined && input.installmentsCount !== entry.installmentsCount);

    if (!needsRecreate) {
      return this.entriesRepo.update(entryId, {
        description: input.description ?? entry.description,
        expenseCategoryId: input.expenseCategoryId ?? entry.expenseCategoryId,
        notes: input.notes !== undefined ? input.notes : entry.notes,
        updatedAt: now,
      });
    }

    const card = await this.findById(cardId);

    // 1. Cancela parcelas existentes e coleta faturas afetadas
    const existingInstallments = await this.installmentsRepo.findByEntryId(entryId);
    const affectedInvoiceIds = new Set<string>();

    for (const inst of existingInstallments) {
      if (inst.status !== InstallmentStatus.CANCELED) {
        if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
        await this.installmentsRepo.update(inst.id, {
          status: InstallmentStatus.CANCELED,
          updatedAt: now,
        });
      }
    }

    // 2. Estorna pagamentos de faturas pagas e volta status para OPEN
    for (const invoiceId of affectedInvoiceIds) {
      const invoice = await this.invoicesRepo.findById(invoiceId);
      if (!invoice) continue;
      if (invoice.status === InvoiceStatus.PAID) {
        const linked = await this.transactionsRepo.findByOrigin(
          OriginType.CREDIT_CARD_INVOICE,
          invoiceId,
        );
        for (const tx of linked) {
          if (tx.status !== TransactionStatus.REVERSED) {
            await this.transactionsRepo.update(tx.id, {
              status: TransactionStatus.REVERSED,
              updatedAt: now,
            });
          }
        }
        await this.invoicesRepo.update(invoiceId, {
          status: InvoiceStatus.OPEN,
          paymentDate: null,
          paymentAccountId: null,
          updatedAt: now,
        });
      }
      await this.recalcInvoiceTotal(invoiceId);
    }

    // 3. Determina novos valores
    const newTotalAmount = input.totalAmount ?? entry.totalAmount;
    const newPurchaseDate = input.purchaseDate ?? entry.purchaseDate;
    const newEntryType = (input.entryType ?? entry.entryType) as CardEntryType;

    let count: number;
    if (newEntryType === CardEntryType.CASH) {
      count = 1;
    } else if (newEntryType === CardEntryType.FIXED) {
      count = 1;
    } else {
      count = input.installmentsCount ?? entry.installmentsCount;
    }

    // 4. Atualiza o lançamento
    const updatedEntry = await this.entriesRepo.update(entryId, {
      description: input.description ?? entry.description,
      expenseCategoryId: input.expenseCategoryId ?? entry.expenseCategoryId,
      totalAmount: newTotalAmount,
      purchaseDate: newPurchaseDate,
      entryType: newEntryType,
      installmentsCount: count,
      notes: input.notes !== undefined ? input.notes : entry.notes,
      updatedAt: now,
    });

    // 5. Recria parcelas usando o fechamento vigente na criação do lançamento
    // (não o closingDay atual do cartão, que pode ter mudado desde então)
    const firstMonth = this.getInvoiceMonth(newPurchaseDate, entry.closingDayUsed);
    const base = Math.floor(newTotalAmount / count);
    const remainder = newTotalAmount - base * count;

    for (let i = 0; i < count; i++) {
      const { month, year } = this.addMonths(firstMonth.month, firstMonth.year, i);
      const amount = base + (i === 0 ? remainder : 0);
      const invoice = await this.findOrCreateInvoice(cardId, month, year, card.dueDay);

      await this.installmentsRepo.create({
        id: generateId(),
        creditCardEntryId: entryId,
        installmentNumber: i + 1,
        totalInstallments: count,
        amount,
        month,
        year,
        status: InstallmentStatus.OPEN,
        creditCardInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
      });

      await this.recalcInvoiceTotal(invoice.id);
    }

    if (newEntryType === CardEntryType.FIXED) {
      const nowDate = new Date();
      await this.ensureFixedInstallments(updatedEntry, card, nowDate.getMonth() + 1, nowDate.getFullYear());
    }

    return updatedEntry;
  }

  async deleteEntry(
    cardId: string,
    entryId: string,
    scope?: 'CURRENT' | 'CURRENT_AND_FUTURE',
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    const entry = await this.getEntryChecked(cardId, entryId);
    if (!entry.active) throw new AppError('Lançamento já está inativo.', 400);

    if (entry.entryType === CardEntryType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
        );
      }
      return this.deleteFixedEntry(entry, scope, referenceMonth, referenceYear);
    }

    const now = nowISO();

    const installments = await this.installmentsRepo.findByEntryId(entryId);
    const affectedInvoiceIds = new Set<string>();

    for (const inst of installments) {
      if (inst.status !== InstallmentStatus.CANCELED) {
        if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
        await this.installmentsRepo.update(inst.id, {
          status: InstallmentStatus.CANCELED,
          updatedAt: now,
        });
      }
    }

    await this.entriesRepo.update(entryId, { active: false, updatedAt: now });

    for (const invoiceId of affectedInvoiceIds) {
      await this.recalcInvoiceTotal(invoiceId);
    }
  }

  // Lançamentos fixos são recorrentes por tempo indeterminado, então a exclusão
  // precisa escolher um escopo: apenas a referência atual (mantém a recorrência
  // ativa para os próximos meses) ou a atual + futuras (encerra a recorrência).
  // O histórico (referências anteriores à escolhida) nunca é alterado.
  private async deleteFixedEntry(
    entry: CreditCardEntry,
    scope: 'CURRENT' | 'CURRENT_AND_FUTURE',
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = this.monthKey(referenceMonth, referenceYear);

    const installments = await this.installmentsRepo.findByEntryId(entry.id);
    const affectedInvoiceIds = new Set<string>();

    const toCancel = installments.filter((i) => {
      if (i.status === InstallmentStatus.CANCELED) return false;
      const key = this.monthKey(i.month, i.year);
      return scope === 'CURRENT' ? key === refKey : key >= refKey;
    });

    for (const inst of toCancel) {
      if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
      await this.installmentsRepo.update(inst.id, {
        status: InstallmentStatus.CANCELED,
        updatedAt: now,
      });
    }

    if (scope === 'CURRENT_AND_FUTURE') {
      await this.entriesRepo.update(entry.id, { active: false, updatedAt: now });
    }

    for (const invoiceId of affectedInvoiceIds) {
      await this.recalcInvoiceTotal(invoiceId);
    }
  }

  // ─── Invoice payment ──────────────────────────────────────────────────────────

  async payInvoice(
    cardId: string,
    invoiceId: string,
    input: PayInvoiceInput,
  ): Promise<CreditCardInvoice> {
    const card = await this.findById(cardId);
    const invoice = await this.invoicesRepo.findById(invoiceId);

    if (!invoice) throw new AppError('Fatura não encontrada.', 404);
    if (invoice.creditCardId !== cardId)
      throw new AppError('Fatura não pertence a este cartão.', 400);
    if (invoice.status === InvoiceStatus.PAID)
      throw new AppError('Fatura já foi paga.', 400);
    if (invoice.status === InvoiceStatus.CANCELED)
      throw new AppError('Fatura cancelada não pode ser paga.', 400);

    const settings = await this.settingsRepo.get();
    const paymentAccountId =
      input?.paymentAccountId ??
      card.defaultPaymentAccountId ??
      settings?.mainAccountId ??
      null;

    const now = nowISO();
    const paymentDate = input?.paymentDate ?? invoice.dueDate;

    await this.transactionsRepo.create({
      id: generateId(),
      type: TransactionType.CREDIT_CARD_PAYMENT,
      description: `Pagamento fatura ${card.name} ${invoice.month}/${invoice.year}`,
      categoryId: null,
      amount: invoice.totalAmount,
      expectedDate: paymentDate,
      actualDate: now,
      status: TransactionStatus.PAID,
      sourceAccountId: paymentAccountId,
      targetAccountId: null,
      originType: OriginType.CREDIT_CARD_INVOICE,
      originId: invoice.id,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    return this.invoicesRepo.update(invoiceId, {
      status: InvoiceStatus.PAID,
      paymentDate,
      paymentAccountId,
      updatedAt: now,
    });
  }

  async revertInvoice(
    cardId: string,
    invoiceId: string,
  ): Promise<CreditCardInvoice> {
    const invoice = await this.invoicesRepo.findById(invoiceId);

    if (!invoice) throw new AppError('Fatura não encontrada.', 404);
    if (invoice.creditCardId !== cardId)
      throw new AppError('Fatura não pertence a este cartão.', 400);
    if (invoice.status !== InvoiceStatus.PAID)
      throw new AppError('Apenas faturas pagas podem ser revertidas.', 400);

    const now = nowISO();

    const linked = await this.transactionsRepo.findByOrigin(
      OriginType.CREDIT_CARD_INVOICE,
      invoiceId,
    );
    for (const tx of linked) {
      if (tx.status !== TransactionStatus.REVERSED) {
        await this.transactionsRepo.update(tx.id, {
          status: TransactionStatus.REVERSED,
          updatedAt: now,
        });
      }
    }

    return this.invoicesRepo.update(invoiceId, {
      status: InvoiceStatus.OPEN,
      paymentDate: null,
      paymentAccountId: null,
      updatedAt: now,
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  // Extrai ano/mês/dia direto da string ISO (sem passar por Date/timezone local),
  // para não sofrer o deslocamento de um dia em fusos com offset negativo (ex.: UTC-3).
  private getInvoiceMonth(
    purchaseDateISO: string,
    closingDay: number,
  ): { month: number; year: number } {
    const [yearStr, monthStr, dayStr] = purchaseDateISO.slice(0, 10).split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (day <= closingDay) {
      return { month, year };
    }
    if (month === 12) {
      return { month: 1, year: year + 1 };
    }
    return { month: month + 1, year };
  }

  private addMonths(
    month: number,
    year: number,
    count: number,
  ): { month: number; year: number } {
    const d = new Date(year, month - 1 + count, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }

  private monthKey(month: number, year: number): number {
    return year * 12 + month;
  }

  // Lançamentos do tipo FIXED (ex.: assinaturas) são recorrentes por tempo
  // indeterminado: em vez de criar todas as parcelas de uma vez, cada nova
  // referência é gerada sob demanda, conforme o usuário navega até o mês
  // (getCardFlow/findAll), até o limite do mês/ano solicitado.
  private async ensureFixedInstallments(
    entry: CreditCardEntry,
    card: CreditCard,
    targetMonth: number,
    targetYear: number,
  ): Promise<void> {
    if (entry.entryType !== CardEntryType.FIXED || !entry.active) return;

    const existing = await this.installmentsRepo.findByEntryId(entry.id);
    if (existing.length === 0) return;

    let lastMonth = 0;
    let lastYear = 0;
    let lastNumber = 0;
    for (const i of existing) {
      if (this.monthKey(i.month, i.year) > this.monthKey(lastMonth, lastYear)) {
        lastMonth = i.month;
        lastYear = i.year;
      }
      if (i.installmentNumber > lastNumber) lastNumber = i.installmentNumber;
    }

    if (this.monthKey(lastMonth, lastYear) >= this.monthKey(targetMonth, targetYear)) return;

    const now = nowISO();
    let cursor = this.addMonths(lastMonth, lastYear, 1);
    let number = lastNumber;

    while (this.monthKey(cursor.month, cursor.year) <= this.monthKey(targetMonth, targetYear)) {
      number += 1;
      const invoice = await this.findOrCreateInvoice(card.id, cursor.month, cursor.year, card.dueDay);

      await this.installmentsRepo.create({
        id: generateId(),
        creditCardEntryId: entry.id,
        installmentNumber: number,
        totalInstallments: number,
        amount: entry.totalAmount,
        month: cursor.month,
        year: cursor.year,
        status: InstallmentStatus.OPEN,
        creditCardInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
      });

      await this.recalcInvoiceTotal(invoice.id);
      cursor = this.addMonths(cursor.month, cursor.year, 1);
    }

    if (number !== entry.installmentsCount) {
      await this.entriesRepo.update(entry.id, { installmentsCount: number, updatedAt: now });
    }
  }

  private async findOrCreateInvoice(
    cardId: string,
    month: number,
    year: number,
    dueDay: number,
  ): Promise<CreditCardInvoice> {
    const existing = await this.invoicesRepo.findByCardAndMonth(
      cardId,
      month,
      year,
    );
    if (existing) return existing;

    const dueDate = new Date(year, month - 1, dueDay).toISOString();
    const now = nowISO();
    return this.invoicesRepo.create({
      id: generateId(),
      creditCardId: cardId,
      month,
      year,
      dueDate,
      totalAmount: 0,
      status: InvoiceStatus.OPEN,
      paymentDate: null,
      paymentAccountId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async recalcInvoiceTotal(invoiceId: string): Promise<void> {
    const all = await this.installmentsRepo.findAll();
    const total = all
      .filter(
        (i) =>
          i.creditCardInvoiceId === invoiceId &&
          i.status !== InstallmentStatus.CANCELED,
      )
      .reduce((s, i) => s + i.amount, 0);
    await this.invoicesRepo.update(invoiceId, {
      totalAmount: total,
      updatedAt: nowISO(),
    });
  }

  private async getEntryChecked(
    cardId: string,
    entryId: string,
  ): Promise<CreditCardEntry> {
    const entry = await this.entriesRepo.findById(entryId);
    if (!entry) throw new AppError('Lançamento não encontrado.', 404);
    if (entry.creditCardId !== cardId)
      throw new AppError('Lançamento não pertence a este cartão.', 400);
    return entry;
  }
}
