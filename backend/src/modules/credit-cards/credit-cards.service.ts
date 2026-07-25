import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { getInvoiceMonth, addMonths, monthKey } from './credit-cards.date-utils';
import { SettingsRepository } from '../settings/settings.repository';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  OriginType,
  RecurrenceType,
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
    private readonly categoriesRepo: CategoriesRepository,
  ) {}

  // CRUD manual: categoria inválida/inativa/tipo errado é rejeitada com erro
  // explícito (o dropdown do form já só oferece categorias EXPENSE ativas —
  // chegar aqui com um id inválido só acontece por adulteração de request ou
  // condição de corrida, então recusar é mais seguro que substituir
  // silenciosamente pela vontade do usuário).
  private async validateExpenseCategoryId(categoryId: string, tenantId: string): Promise<void> {
    const category = await this.categoriesRepo.findById(categoryId, tenantId);
    if (!category || !category.active || category.type !== CategoryType.EXPENSE) {
      throw new AppError('Categoria inválida ou inativa.', 400, 'creditCardEntry.category.invalid');
    }
  }

  // ─── Cards CRUD ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, month?: number, year?: number): Promise<CreditCardWithSummary[]> {
    const [cards, allEntries] = await Promise.all([
      this.cardsRepo.findActive(tenantId),
      this.entriesRepo.findAll(tenantId),
    ]);

    const now = new Date();
    const currentMonth = month ?? (now.getMonth() + 1);
    const currentYear = year ?? now.getFullYear();

    for (const card of cards) {
      const fixedEntries = allEntries.filter(
        (e) => e.creditCardId === card.id && e.active && e.entryType === CardEntryType.FIXED,
      );
      for (const entry of fixedEntries) {
        await this.ensureFixedInstallments(tenantId, entry, card, currentMonth, currentYear);
      }
    }

    const [allInstallments, allInvoices] = await Promise.all([
      this.installmentsRepo.findAll(tenantId),
      this.invoicesRepo.findAll(tenantId),
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

  async findById(id: string, tenantId: string): Promise<CreditCard> {
    const card = await this.cardsRepo.findById(id, tenantId);
    if (!card) throw new AppError('Cartão não encontrado.', 404, 'creditCard.notFound');
    if (!card.active) throw new AppError('Cartão inativo.', 400, 'creditCard.inactive');
    return card;
  }

  async create(tenantId: string, input: CreateCreditCardInput): Promise<CreditCard> {
    const now = nowISO();
    return this.cardsRepo.create({
      id: generateId(),
      tenantId,
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

  async update(id: string, input: UpdateCreditCardInput, tenantId: string): Promise<CreditCard> {
    await this.findById(id, tenantId);
    return this.cardsRepo.update(id, { ...input, updatedAt: nowISO() }, tenantId);
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.cardsRepo.update(id, { active: false, updatedAt: nowISO() }, tenantId);
  }

  // ─── Card flow ────────────────────────────────────────────────────────────────

  async getCardFlow(
    cardId: string,
    tenantId: string,
    month: number,
    year: number,
  ): Promise<CardFlowResponse> {
    const card = await this.findById(cardId, tenantId);

    const allEntries = await this.entriesRepo.findByCardId(tenantId, cardId);
    const fixedEntries = allEntries.filter(
      (e) => e.active && e.entryType === CardEntryType.FIXED,
    );
    for (const entry of fixedEntries) {
      await this.ensureFixedInstallments(tenantId, entry, card, month, year);
    }

    const [invoice, installments] = await Promise.all([
      this.invoicesRepo.findByCardAndMonth(tenantId, cardId, month, year),
      this.installmentsRepo.findByCardAndMonth(tenantId, cardId, month, year),
    ]);

    const active = installments.filter(
      (i) => i.status !== InstallmentStatus.CANCELED,
    );

    const entryIds = new Set(active.map((i) => i.creditCardEntryId));
    const entries = allEntries.filter((e) => entryIds.has(e.id));
    const entryMap = new Map(entries.map((e) => [e.id, e]));

    // invoiceTotal é o valor bruto faturado (compras/estornos) — exclui o
    // lançamento PAYMENT gerado ao pagar a fatura, senão o total "sumiria"
    // após o pagamento e telas como Dashboard/Fluxo de Caixa (que também
    // leem esse mesmo valor via invoice.totalAmount) perderiam o histórico
    // do quanto foi gasto no mês. O "zerar" fica visível aqui em paidAmount/
    // openAmount, e o próprio lançamento PAYMENT aparece na lista de
    // entries/installments retornada — como uma linha de crédito no extrato.
    const invoiceTotal = active
      .filter((i) => entryMap.get(i.creditCardEntryId)?.entryType !== CardEntryType.PAYMENT)
      .reduce((s, i) => s + i.amount, 0);
    const paymentAmount = active
      .filter((i) => entryMap.get(i.creditCardEntryId)?.entryType === CardEntryType.PAYMENT)
      .reduce((s, i) => s + Math.abs(i.amount), 0);
    // Faturas marcadas como pagas ANTES do lançamento PAYMENT existir (essa
    // função só passou a criá-lo a partir de agora) não têm essa parcela de
    // baixa — sem este fallback, ficariam para sempre com paidAmount=0 e
    // openAmount=total mesmo já estando pagas. O status persistido da
    // fatura é a fonte de verdade quando não há PAYMENT correspondente.
    const paidAmount =
      paymentAmount === 0 && invoice?.status === InvoiceStatus.PAID ? invoiceTotal : paymentAmount;

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
    tenantId: string,
    input: CreateCardEntryInput,
  ): Promise<{ entry: CreditCardEntry; installments: CreditCardInstallment[] }> {
    const card = await this.findById(cardId, tenantId);
    await this.validateExpenseCategoryId(input.expenseCategoryId, tenantId);

    const firstMonth = getInvoiceMonth(input.purchaseDate, card.closingDay);

    let count: number;
    if (input.entryType === CardEntryType.CASH || input.entryType === CardEntryType.REFUND) {
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
      tenantId,
      creditCardId: cardId,
      description: input.description,
      expenseCategoryId: input.expenseCategoryId,
      totalAmount: input.totalAmount,
      purchaseDate: input.purchaseDate,
      entryType: input.entryType,
      installmentsCount: count,
      closingDayUsed: card.closingDay,
      notes: input.notes ?? null,
      externalRef: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const installmentsToCreate: CreditCardInstallment[] = [];
    const invoiceIdsToRecalc = new Set<string>();

    for (let i = 0; i < count; i++) {
      const { month, year } = addMonths(
        firstMonth.month,
        firstMonth.year,
        i,
      );
      const amount = base + (i === 0 ? remainder : 0);
      const invoice = await this.findOrCreateInvoice(
        tenantId,
        cardId,
        month,
        year,
        card.dueDay,
      );

      installmentsToCreate.push({
        id: generateId(),
        tenantId,
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
      invoiceIdsToRecalc.add(invoice.id);
    }

    const createdInstallments = await this.installmentsRepo.createMany(
      installmentsToCreate,
    );
    await this.recalcInvoiceTotals(tenantId, invoiceIdsToRecalc);

    if (entry.entryType === CardEntryType.FIXED) {
      const nowDate = new Date();
      await this.ensureFixedInstallments(tenantId, entry, card, nowDate.getMonth() + 1, nowDate.getFullYear());
    }

    return { entry, installments: createdInstallments };
  }

  async updateEntry(
    cardId: string,
    entryId: string,
    tenantId: string,
    input: UpdateCardEntryInput,
  ): Promise<CreditCardEntry> {
    const entry = await this.getEntryChecked(cardId, entryId, tenantId);
    if (!entry.active) throw new AppError('Lançamento inativo.', 400, 'creditCardEntry.inactive');
    if (entry.entryType === CardEntryType.PAYMENT) {
      throw new AppError(
        'Lançamento gerado automaticamente pelo pagamento da fatura não pode ser editado diretamente. Reverta o pagamento da fatura.',
        400,
        'creditCardEntry.paymentManaged',
      );
    }
    if (input.expenseCategoryId) {
      await this.validateExpenseCategoryId(input.expenseCategoryId, tenantId);
    }

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
      }, tenantId);
    }

    const card = await this.findById(cardId, tenantId);

    // 1. Cancela parcelas existentes e coleta faturas afetadas
    const existingInstallments = await this.installmentsRepo.findByEntryId(tenantId, entryId);
    const affectedInvoiceIds = new Set<string>();

    for (const inst of existingInstallments) {
      if (inst.status !== InstallmentStatus.CANCELED) {
        if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
        await this.installmentsRepo.update(inst.id, {
          status: InstallmentStatus.CANCELED,
          updatedAt: now,
        }, tenantId);
      }
    }

    // 2. Estorna pagamento (transação + lançamento PAYMENT interno) de
    // faturas já pagas e volta status para OPEN
    await this.reopenPaidInvoices(affectedInvoiceIds, tenantId, now);
    await this.recalcInvoiceTotals(tenantId, affectedInvoiceIds);

    // 3. Determina novos valores
    const newTotalAmount = input.totalAmount ?? entry.totalAmount;
    const newPurchaseDate = input.purchaseDate ?? entry.purchaseDate;
    const newEntryType = (input.entryType ?? entry.entryType) as CardEntryType;

    // O schema só valida o sinal na criação (lá o entryType é sempre
    // obrigatório); aqui o update é parcial, então a checagem precisa do
    // valor efetivo já resolvido (newEntryType/newTotalAmount).
    if (newEntryType === CardEntryType.REFUND && newTotalAmount >= 0) {
      throw new AppError('Estorno deve ter valor negativo.', 400, 'creditCardEntry.totalAmount.mustBeNegativeForRefund');
    }
    if (newEntryType !== CardEntryType.REFUND && newTotalAmount <= 0) {
      throw new AppError('Valor do lançamento deve ser positivo.', 400, 'creditCardEntry.totalAmount.positive');
    }

    let count: number;
    if (newEntryType === CardEntryType.CASH || newEntryType === CardEntryType.REFUND) {
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
    }, tenantId);

    // 5. Recria parcelas usando o fechamento vigente na criação do lançamento
    // (não o closingDay atual do cartão, que pode ter mudado desde então)
    const firstMonth = getInvoiceMonth(newPurchaseDate, entry.closingDayUsed);
    const base = Math.floor(newTotalAmount / count);
    const remainder = newTotalAmount - base * count;

    const installmentsToCreate: CreditCardInstallment[] = [];
    const invoiceIdsToRecalc = new Set<string>();

    for (let i = 0; i < count; i++) {
      const { month, year } = addMonths(firstMonth.month, firstMonth.year, i);
      const amount = base + (i === 0 ? remainder : 0);
      const invoice = await this.findOrCreateInvoice(tenantId, cardId, month, year, card.dueDay);

      installmentsToCreate.push({
        id: generateId(),
        tenantId,
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
      invoiceIdsToRecalc.add(invoice.id);
    }

    await this.installmentsRepo.createMany(installmentsToCreate);
    await this.recalcInvoiceTotals(tenantId, invoiceIdsToRecalc);

    if (newEntryType === CardEntryType.FIXED) {
      const nowDate = new Date();
      await this.ensureFixedInstallments(tenantId, updatedEntry, card, nowDate.getMonth() + 1, nowDate.getFullYear());
    }

    return updatedEntry;
  }

  async deleteEntry(
    cardId: string,
    entryId: string,
    tenantId: string,
    scope?: 'CURRENT' | 'CURRENT_AND_FUTURE',
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    const entry = await this.getEntryChecked(cardId, entryId, tenantId);
    if (!entry.active) throw new AppError('Lançamento já está inativo.', 400, 'creditCardEntry.alreadyInactive');
    if (entry.entryType === CardEntryType.PAYMENT) {
      throw new AppError(
        'Lançamento gerado automaticamente pelo pagamento da fatura não pode ser excluído diretamente. Reverta o pagamento da fatura.',
        400,
        'creditCardEntry.paymentManaged',
      );
    }

    if (entry.entryType === CardEntryType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
          'creditCardEntry.scopeRequired',
        );
      }
      return this.deleteFixedEntry(entry, tenantId, scope, referenceMonth, referenceYear);
    }

    if (entry.entryType === CardEntryType.INSTALLMENT) {
      // Parcelamento: excluir a partir do mês em que o usuário está (a
      // referência atual da tela) cancela esse mês e os seguintes, mas NUNCA
      // mexe em parcelas de meses anteriores — mesmas parcelas já refletidas/
      // fechadas continuam intactas, só a dívida remanescente é encerrada.
      if (!referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe o mês/ano de referência para excluir a partir dele.',
          400,
          'creditCardEntry.referenceRequired',
        );
      }
      return this.deleteInstallmentEntryFromReference(entry, tenantId, referenceMonth, referenceYear);
    }

    // CASH / REFUND: sempre uma parcela só (no mês do próprio lançamento) —
    // excluir sempre cancela por completo, sem necessidade de referência.
    const now = nowISO();

    const installments = await this.installmentsRepo.findByEntryId(tenantId, entryId);
    const affectedInvoiceIds = new Set<string>();

    for (const inst of installments) {
      if (inst.status !== InstallmentStatus.CANCELED) {
        if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
        await this.installmentsRepo.update(inst.id, {
          status: InstallmentStatus.CANCELED,
          updatedAt: now,
        }, tenantId);
      }
    }

    await this.reopenPaidInvoices(affectedInvoiceIds, tenantId, now);

    await this.entriesRepo.update(entryId, { active: false, updatedAt: now }, tenantId);

    await this.recalcInvoiceTotals(tenantId, affectedInvoiceIds);
  }

  // Cancela as parcelas de um lançamento parcelado (INSTALLMENT) a partir do
  // mês de referência (inclusive) em diante, preservando parcelas de meses
  // anteriores intactas (já refletidas/fechadas). Se não sobrar nenhuma
  // parcela ativa anterior à referência, o lançamento é desativado por
  // completo; senão continua ativo, representando só a parte já ocorrida.
  private async deleteInstallmentEntryFromReference(
    entry: CreditCardEntry,
    tenantId: string,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);

    const installments = await this.installmentsRepo.findByEntryId(tenantId, entry.id);
    const active = installments.filter((i) => i.status !== InstallmentStatus.CANCELED);
    const toCancel = active.filter((i) => monthKey(i.month, i.year) >= refKey);
    const remaining = active.filter((i) => monthKey(i.month, i.year) < refKey);

    const affectedInvoiceIds = new Set<string>();
    for (const inst of toCancel) {
      if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
      await this.installmentsRepo.update(inst.id, {
        status: InstallmentStatus.CANCELED,
        updatedAt: now,
      }, tenantId);
    }

    await this.reopenPaidInvoices(affectedInvoiceIds, tenantId, now);

    if (remaining.length === 0) {
      await this.entriesRepo.update(entry.id, { active: false, updatedAt: now }, tenantId);
    }

    await this.recalcInvoiceTotals(tenantId, affectedInvoiceIds);
  }

  // Lançamentos fixos são recorrentes por tempo indeterminado, então a exclusão
  // precisa escolher um escopo: apenas a referência atual (mantém a recorrência
  // ativa para os próximos meses) ou a atual + futuras (encerra a recorrência).
  // O histórico (referências anteriores à escolhida) nunca é alterado.
  private async deleteFixedEntry(
    entry: CreditCardEntry,
    tenantId: string,
    scope: 'CURRENT' | 'CURRENT_AND_FUTURE',
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);

    const installments = await this.installmentsRepo.findByEntryId(tenantId, entry.id);
    const affectedInvoiceIds = new Set<string>();

    const toCancel = installments.filter((i) => {
      if (i.status === InstallmentStatus.CANCELED) return false;
      const key = monthKey(i.month, i.year);
      return scope === 'CURRENT' ? key === refKey : key >= refKey;
    });

    for (const inst of toCancel) {
      if (inst.creditCardInvoiceId) affectedInvoiceIds.add(inst.creditCardInvoiceId);
      await this.installmentsRepo.update(inst.id, {
        status: InstallmentStatus.CANCELED,
        updatedAt: now,
      }, tenantId);
    }

    await this.reopenPaidInvoices(affectedInvoiceIds, tenantId, now);

    if (scope === 'CURRENT_AND_FUTURE') {
      await this.entriesRepo.update(entry.id, { active: false, updatedAt: now }, tenantId);
    }

    await this.recalcInvoiceTotals(tenantId, affectedInvoiceIds);
  }

  // Reverte o pagamento (transação + lançamento PAYMENT interno) de qualquer
  // fatura já paga entre as informadas e a reabre (status OPEN). Chamado
  // sempre que parcelas de um lançamento são canceladas/recriadas
  // (updateEntry, deleteEntry, deleteFixedEntry) — sem isso, cancelar a
  // parcela de uma fatura já paga deixaria o status PAID com total
  // desatualizado e a transação de pagamento sem correspondência real.
  private async reopenPaidInvoices(invoiceIds: Iterable<string>, tenantId: string, now: string): Promise<void> {
    for (const invoiceId of invoiceIds) {
      const invoice = await this.invoicesRepo.findById(invoiceId, tenantId);
      if (!invoice) continue;
      if (invoice.status === InvoiceStatus.PAID) {
        await this.revertInvoicePayment(invoiceId, tenantId, now);
        await this.invoicesRepo.update(invoiceId, {
          status: InvoiceStatus.OPEN,
          paymentDate: null,
          paymentAccountId: null,
          updatedAt: now,
        }, tenantId);
      }
    }
  }

  // ─── Invoice payment ──────────────────────────────────────────────────────────

  async payInvoice(
    cardId: string,
    invoiceId: string,
    tenantId: string,
    input: PayInvoiceInput,
  ): Promise<CreditCardInvoice> {
    const card = await this.findById(cardId, tenantId);
    const invoice = await this.invoicesRepo.findById(invoiceId, tenantId);

    if (!invoice) throw new AppError('Fatura não encontrada.', 404, 'creditCardInvoice.notFound');
    if (invoice.creditCardId !== cardId)
      throw new AppError('Fatura não pertence a este cartão.', 400, 'creditCardInvoice.belongsToOtherCard');
    if (invoice.status === InvoiceStatus.PAID)
      throw new AppError('Fatura já foi paga.', 400, 'creditCardInvoice.alreadyPaid');
    if (invoice.status === InvoiceStatus.CANCELED)
      throw new AppError('Fatura cancelada não pode ser paga.', 400, 'creditCardInvoice.canceled');

    const settings = await this.settingsRepo.get(tenantId);
    const paymentAccountId =
      input?.paymentAccountId ??
      card.defaultPaymentAccountId ??
      settings?.mainAccountId ??
      null;

    const now = nowISO();
    const paymentDate = input?.paymentDate ?? invoice.dueDate;

    await this.transactionsRepo.create({
      id: generateId(),
      tenantId,
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
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Lançamento de crédito DENTRO da própria fatura, igual um extrato de
    // banco mostra o pagamento como uma linha que abate o saldo — ver
    // CardEntryType.PAYMENT e getCardFlow (que expõe o zeramento via
    // summary.paidAmount/openAmount, mantendo invoice.totalAmount como o
    // valor bruto faturado). Fatura sem valor não gera lançamento de crédito.
    if (invoice.totalAmount !== 0) {
      const paymentEntryId = generateId();
      await this.entriesRepo.create({
        id: paymentEntryId,
        tenantId,
        creditCardId: cardId,
        description: `Pagamento fatura ${card.name} ${invoice.month}/${invoice.year}`,
        expenseCategoryId: '',
        totalAmount: -invoice.totalAmount,
        purchaseDate: paymentDate,
        entryType: CardEntryType.PAYMENT,
        installmentsCount: 1,
        closingDayUsed: card.closingDay,
        notes: null,
        externalRef: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await this.installmentsRepo.createMany([{
        id: generateId(),
        tenantId,
        creditCardEntryId: paymentEntryId,
        installmentNumber: 1,
        totalInstallments: 1,
        amount: -invoice.totalAmount,
        month: invoice.month,
        year: invoice.year,
        status: InstallmentStatus.PAID,
        creditCardInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
      }]);
    }

    return this.invoicesRepo.update(invoiceId, {
      status: InvoiceStatus.PAID,
      paymentDate,
      paymentAccountId,
      updatedAt: now,
    }, tenantId);
  }

  // Reverte o pagamento de uma fatura: estorna a FinancialTransaction (nunca
  // apagada, só marcada REVERSED) e soft-deleta o lançamento PAYMENT interno
  // criado por payInvoice. Único caminho autorizado a remover um entry
  // PAYMENT — updateEntry/deleteEntry bloqueiam edição/exclusão direta dele.
  // Reaproveitado por revertInvoice e por updateEntry (ao editar um entry
  // comum de uma fatura já paga).
  private async revertInvoicePayment(invoiceId: string, tenantId: string, now: string): Promise<void> {
    const linked = await this.transactionsRepo.findByOrigin(
      tenantId,
      OriginType.CREDIT_CARD_INVOICE,
      invoiceId,
    );
    for (const tx of linked) {
      if (tx.status !== TransactionStatus.REVERSED) {
        await this.transactionsRepo.update(tx.id, {
          status: TransactionStatus.REVERSED,
          updatedAt: now,
        }, tenantId);
      }
    }

    const installments = await this.installmentsRepo.findByInvoiceId(tenantId, invoiceId);
    for (const inst of installments) {
      if (inst.status === InstallmentStatus.CANCELED) continue;
      const entry = await this.entriesRepo.findById(inst.creditCardEntryId, tenantId);
      if (entry?.entryType !== CardEntryType.PAYMENT) continue;
      await this.installmentsRepo.update(inst.id, { status: InstallmentStatus.CANCELED, updatedAt: now }, tenantId);
      if (entry.active) {
        await this.entriesRepo.update(entry.id, { active: false, updatedAt: now }, tenantId);
      }
    }
  }

  async revertInvoice(
    cardId: string,
    invoiceId: string,
    tenantId: string,
  ): Promise<CreditCardInvoice> {
    const invoice = await this.invoicesRepo.findById(invoiceId, tenantId);

    if (!invoice) throw new AppError('Fatura não encontrada.', 404, 'creditCardInvoice.notFound');
    if (invoice.creditCardId !== cardId)
      throw new AppError('Fatura não pertence a este cartão.', 400, 'creditCardInvoice.belongsToOtherCard');
    if (invoice.status !== InvoiceStatus.PAID)
      throw new AppError('Apenas faturas pagas podem ser revertidas.', 400, 'creditCardInvoice.notPaid');

    const now = nowISO();

    await this.revertInvoicePayment(invoiceId, tenantId, now);
    await this.recalcInvoiceTotals(tenantId, [invoiceId]);

    return this.invoicesRepo.update(invoiceId, {
      status: InvoiceStatus.OPEN,
      paymentDate: null,
      paymentAccountId: null,
      updatedAt: now,
    }, tenantId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────
  // getInvoiceMonth/addMonths/monthKey vivem em credit-cards.date-utils.ts —
  // são funções puras reaproveitadas pelo serviço de importação de fatura.

  // Lançamentos do tipo FIXED (ex.: assinaturas) são recorrentes por tempo
  // indeterminado: em vez de criar todas as parcelas de uma vez, cada nova
  // referência é gerada sob demanda, conforme o usuário navega até o mês
  // (getCardFlow/findAll), até o limite do mês/ano solicitado.
  // Lançamentos fixos são materializados sob demanda: tanto findAll (lista de
  // cartões) quanto getCardFlow (detalhe do cartão) chamam esta função para o
  // mesmo mês sempre que a tela carrega com um cartão selecionado — as duas
  // requisições rodam de verdade em paralelo. Sem serialização, ambas leem o
  // "ainda não existe parcela de setembro" ao mesmo tempo e cada uma cria sua
  // própria cópia, duplicando o lançamento. Como a aplicação roda num único
  // processo Node, um lock em memória por lançamento resolve isso na origem:
  // a segunda chamada simplesmente espera a primeira terminar em vez de
  // refazer o mesmo trabalho, então só uma extensão por lançamento roda por
  // vez e nunca há o que duplicar.
  private readonly fixedInstallmentLocks = new Map<string, Promise<void>>();

  private async ensureFixedInstallments(
    tenantId: string,
    entry: CreditCardEntry,
    card: CreditCard,
    targetMonth: number,
    targetYear: number,
  ): Promise<void> {
    if (entry.entryType !== CardEntryType.FIXED || !entry.active) return;

    const lockKey = `${tenantId}|${entry.id}`;
    const pending = this.fixedInstallmentLocks.get(lockKey);
    if (pending) {
      // Já existe uma extensão em andamento para este lançamento — espera
      // terminar e reavalia: o mês pedido pode já ter sido coberto por ela.
      await pending;
      return this.ensureFixedInstallments(tenantId, entry, card, targetMonth, targetYear);
    }

    const run = this.materializeFixedInstallments(tenantId, entry, card, targetMonth, targetYear);
    this.fixedInstallmentLocks.set(lockKey, run);
    try {
      await run;
    } finally {
      this.fixedInstallmentLocks.delete(lockKey);
    }
  }

  private async materializeFixedInstallments(
    tenantId: string,
    entry: CreditCardEntry,
    card: CreditCard,
    targetMonth: number,
    targetYear: number,
  ): Promise<void> {
    const existing = await this.installmentsRepo.findByEntryId(tenantId, entry.id);
    if (existing.length === 0) return;

    let lastMonth = 0;
    let lastYear = 0;
    let lastNumber = 0;
    for (const i of existing) {
      if (monthKey(i.month, i.year) > monthKey(lastMonth, lastYear)) {
        lastMonth = i.month;
        lastYear = i.year;
      }
      if (i.installmentNumber > lastNumber) lastNumber = i.installmentNumber;
    }

    if (monthKey(lastMonth, lastYear) >= monthKey(targetMonth, targetYear)) return;

    const now = nowISO();
    let cursor = addMonths(lastMonth, lastYear, 1);
    let number = lastNumber;

    const installmentsToCreate: CreditCardInstallment[] = [];
    const invoiceIdsToRecalc = new Set<string>();

    while (monthKey(cursor.month, cursor.year) <= monthKey(targetMonth, targetYear)) {
      number += 1;
      const invoice = await this.findOrCreateInvoice(tenantId, card.id, cursor.month, cursor.year, card.dueDay);

      installmentsToCreate.push({
        id: generateId(),
        tenantId,
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
      invoiceIdsToRecalc.add(invoice.id);
      cursor = addMonths(cursor.month, cursor.year, 1);
    }

    await this.installmentsRepo.createMany(installmentsToCreate);
    await this.recalcInvoiceTotals(tenantId, invoiceIdsToRecalc);

    if (number !== entry.installmentsCount) {
      await this.entriesRepo.update(entry.id, { installmentsCount: number, updatedAt: now }, tenantId);
    }
  }

  private async findOrCreateInvoice(
    tenantId: string,
    cardId: string,
    month: number,
    year: number,
    dueDay: number,
  ): Promise<CreditCardInvoice> {
    const existing = await this.invoicesRepo.findByCardAndMonth(
      tenantId,
      cardId,
      month,
      year,
    );
    if (existing) return existing;

    const dueDate = new Date(year, month - 1, dueDay).toISOString();
    const now = nowISO();
    return this.invoicesRepo.create({
      id: generateId(),
      tenantId,
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

  // Recalcula o total de uma ou mais faturas com uma única leitura do
  // arquivo de parcelas (em vez de um findAll() por fatura), já que todas
  // as parcelas necessárias já estão presentes numa única leitura.
  private async recalcInvoiceTotals(
    tenantId: string,
    invoiceIds: Iterable<string>,
  ): Promise<void> {
    const ids = [...new Set(invoiceIds)];
    if (ids.length === 0) return;

    const [all, allEntries] = await Promise.all([
      this.installmentsRepo.findAll(tenantId),
      this.entriesRepo.findAll(tenantId),
    ]);
    // invoice.totalAmount é o valor bruto faturado (compras/estornos) — o
    // lançamento PAYMENT (crédito interno do pagamento) nunca entra nesse
    // somatório, senão a fatura "zeraria" para sempre após ser paga. Ver
    // decisão em getCardFlow.
    const paymentEntryIds = new Set(
      allEntries.filter((e) => e.entryType === CardEntryType.PAYMENT).map((e) => e.id),
    );
    const now = nowISO();

    for (const invoiceId of ids) {
      const total = all
        .filter(
          (i) =>
            i.creditCardInvoiceId === invoiceId &&
            i.status !== InstallmentStatus.CANCELED &&
            !paymentEntryIds.has(i.creditCardEntryId),
        )
        .reduce((s, i) => s + i.amount, 0);
      await this.invoicesRepo.update(invoiceId, {
        totalAmount: total,
        updatedAt: now,
      }, tenantId);
    }
  }

  private async getEntryChecked(
    cardId: string,
    entryId: string,
    tenantId: string,
  ): Promise<CreditCardEntry> {
    const entry = await this.entriesRepo.findById(entryId, tenantId);
    if (!entry) throw new AppError('Lançamento não encontrado.', 404, 'creditCardEntry.notFound');
    if (entry.creditCardId !== cardId)
      throw new AppError('Lançamento não pertence a este cartão.', 400, 'creditCardEntry.belongsToOtherCard');
    return entry;
  }
}
