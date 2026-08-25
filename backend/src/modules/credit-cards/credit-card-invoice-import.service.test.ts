import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreditCardInvoiceImportService } from './credit-card-invoice-import.service';
import { CreditCardsService } from './credit-cards.service';
import {
  CreditCardsRepository,
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from './credit-cards.repository';
import { CardEntryType, CreditCard, CreditCardEntry, CreditCardInstallment, CreditCardInvoice, InstallmentStatus } from './credit-cards.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import { FinancialTransaction, OriginType, TransactionStatus, TransactionType } from '../financial-transactions/financial-transactions.types';
import { SettingsRepository } from '../settings/settings.repository';
import { FakeAiProvider } from '../ai/providers/fake-ai.provider';
import { AiConfig } from '../ai/ai.config';

const TENANT_ID = 'test-tenant-1';

class InMemoryRepo<T extends { id: string; tenantId: string }> {
  items: T[] = [];
  async findAll(tenantId: string): Promise<T[]> {
    return this.items.filter((i) => i.tenantId === tenantId);
  }
  async findById(id: string, tenantId: string): Promise<T | null> {
    return this.items.find((i) => i.id === id && i.tenantId === tenantId) ?? null;
  }
  async create(data: T): Promise<T> {
    this.items.push(data);
    return data;
  }
  async createMany(dataList: T[]): Promise<T[]> {
    this.items.push(...dataList);
    return dataList;
  }
  async update(id: string, data: Partial<T>, tenantId: string): Promise<T> {
    const index = this.items.findIndex((i) => i.id === id && i.tenantId === tenantId);
    if (index === -1) throw new Error(`not found: ${id}`);
    this.items[index] = { ...this.items[index], ...data };
    return this.items[index];
  }
  async delete(id: string, tenantId: string): Promise<void> {
    this.items = this.items.filter((i) => !(i.id === id && i.tenantId === tenantId));
  }
  async replaceAll(tenantId: string, items: T[]): Promise<void> {
    const others = this.items.filter((i) => i.tenantId !== tenantId);
    this.items = [...others, ...items];
  }
}

class FakeCardsRepo extends InMemoryRepo<CreditCard> implements CreditCardsRepository {
  async findActive(tenantId: string) {
    return this.items.filter((c) => c.tenantId === tenantId && c.active);
  }
}

class FakeEntriesRepo extends InMemoryRepo<CreditCardEntry> implements CreditCardEntriesRepository {
  async findByCardId(tenantId: string, creditCardId: string) {
    return this.items.filter((e) => e.tenantId === tenantId && e.creditCardId === creditCardId);
  }
  async findActiveByCardId(tenantId: string, creditCardId: string) {
    return this.items.filter((e) => e.tenantId === tenantId && e.creditCardId === creditCardId && e.active);
  }
}

class FakeInstallmentsRepo extends InMemoryRepo<CreditCardInstallment> implements CreditCardInstallmentsRepository {
  async findByEntryId(tenantId: string, entryId: string) {
    return this.items.filter((i) => i.tenantId === tenantId && i.creditCardEntryId === entryId);
  }
  async findByMonth(tenantId: string, month: number, year: number) {
    return this.items.filter((i) => i.tenantId === tenantId && i.month === month && i.year === year);
  }
  async findByCardAndMonth(tenantId: string) {
    return this.items.filter((i) => i.tenantId === tenantId);
  }
  async findByInvoiceId(tenantId: string, invoiceId: string) {
    return this.items.filter((i) => i.tenantId === tenantId && i.creditCardInvoiceId === invoiceId);
  }
}

class FakeInvoicesRepo extends InMemoryRepo<CreditCardInvoice> implements CreditCardInvoicesRepository {
  async findByCardId(tenantId: string, creditCardId: string) {
    return this.items.filter((i) => i.tenantId === tenantId && i.creditCardId === creditCardId);
  }
  async findByCardAndMonth(tenantId: string, creditCardId: string, month: number, year: number) {
    return (
      this.items.find(
        (i) => i.tenantId === tenantId && i.creditCardId === creditCardId && i.month === month && i.year === year,
      ) ?? null
    );
  }
}

class FakeCategoriesRepo extends InMemoryRepo<Category> implements CategoriesRepository {
  async findActive(tenantId: string) {
    return this.items.filter((c) => c.tenantId === tenantId && c.active);
  }
  async findByType(tenantId: string, type: CategoryType) {
    return this.items.filter((c) => c.tenantId === tenantId && c.type === type);
  }
}

class FakeTransactionsRepo extends InMemoryRepo<FinancialTransaction> implements FinancialTransactionsRepository {
  async findByMonth(tenantId: string, month: number, year: number) {
    return this.items.filter((t) => {
      if (t.tenantId !== tenantId) return false;
      const [y, m] = t.expectedDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }
  async findByType(tenantId: string, type: TransactionType) {
    return this.items.filter((t) => t.tenantId === tenantId && t.type === type);
  }
  async findByStatus(tenantId: string, status: TransactionStatus) {
    return this.items.filter((t) => t.tenantId === tenantId && t.status === status);
  }
  async findByOrigin(tenantId: string, originType: OriginType, originId: string) {
    return this.items.filter((t) => t.tenantId === tenantId && t.originType === originType && t.originId === originId);
  }
}

class FakeSettingsRepo implements SettingsRepository {
  async get() {
    return null;
  }
  async upsert(data: never) {
    return data;
  }
  async deleteAll() {}
}

const AI_CONFIG: AiConfig = {
  provider: 'fake',
  apiKey: '',
  model: '',
  maxOutputTokens: 1024,
  requestTimeoutMs: 45_000,
  maxToolRoundsPerTurn: 8,
};

function buildContext() {
  const cardsRepo = new FakeCardsRepo();
  const entriesRepo = new FakeEntriesRepo();
  const installmentsRepo = new FakeInstallmentsRepo();
  const invoicesRepo = new FakeInvoicesRepo();
  const categoriesRepo = new FakeCategoriesRepo();
  const transactionsRepo = new FakeTransactionsRepo();
  const settingsRepo = new FakeSettingsRepo();
  const aiProvider = new FakeAiProvider();

  const creditCardsService = new CreditCardsService(
    cardsRepo,
    entriesRepo,
    installmentsRepo,
    invoicesRepo,
    transactionsRepo,
    categoriesRepo,
  );

  const importService = new CreditCardInvoiceImportService(
    creditCardsService,
    entriesRepo,
    installmentsRepo,
    invoicesRepo,
    categoriesRepo,
    aiProvider,
    AI_CONFIG,
  );

  return { importService, creditCardsService, cardsRepo, entriesRepo, installmentsRepo, invoicesRepo, categoriesRepo, aiProvider };
}

async function seedCard(cardsRepo: FakeCardsRepo, overrides: Partial<CreditCard> = {}): Promise<CreditCard> {
  const now = new Date().toISOString();
  const card: CreditCard = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    name: 'Cartão Teste',
    bank: 'Banco Teste',
    closingDay: 10,
    dueDay: 20,
    limit: 500000,
    defaultPaymentAccountId: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return cardsRepo.create(card);
}

async function seedCategory(categoriesRepo: FakeCategoriesRepo, overrides: Partial<Category> = {}): Promise<Category> {
  const now = new Date().toISOString();
  const category: Category = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    name: 'Mercado',
    type: CategoryType.EXPENSE,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return categoriesRepo.create(category);
}

// Simula a categoria "outros" já cadastrada pelo usuário/seed padrão (ex.:
// "Outros pagamentos") — a importação nunca cria uma categoria nova, só
// reconhece uma já existente cujo nome contenha "outro(s)/outra(s)".
function seedFallbackCategory(categoriesRepo: FakeCategoriesRepo): Promise<Category> {
  return seedCategory(categoriesRepo, { name: 'Outros pagamentos' });
}

function buildOfx(transactions: { fitId: string; date: string; amount: string; name: string }[]): string {
  const blocks = transactions
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>${t.date}
<TRNAMT>${t.amount}
<FITID>${t.fitId}
<NAME>${t.name}
</STMTTRN>`,
    )
    .join('\n');
  return `<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><BANKTRANLIST>${blocks}</BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>`;
}

describe('CreditCardInvoiceImportService — parseInvoice', () => {
  let ctx: ReturnType<typeof buildContext>;

  beforeEach(() => {
    ctx = buildContext();
  });

  it('rejects non-ofx files', async () => {
    const card = await seedCard(ctx.cardsRepo);
    await expect(ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.csv', 'a,b,c')).rejects.toThrow();
  });

  it('keeps the sign of the amount and classifies expense vs estorno/pagamento', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const content = buildOfx([
      { fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' },
      { fitId: '2', date: '20260306', amount: '50.00', name: 'ESTORNO COMPRA' },
      { fitId: '3', date: '20260307', amount: '200.00', name: 'PAGAMENTO EM 05/07' },
    ]);

    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries).toHaveLength(3);
    expect(entries[0].amountCents).toBe(-15000);
    expect(entries[0].suggestedEntryType).toBe('CASH');
    expect(entries[0].possiblePreviousInvoicePayment).toBe(false);

    expect(entries[1].amountCents).toBe(5000);
    expect(entries[1].suggestedEntryType).toBe('REFUND');
    expect(entries[1].possiblePreviousInvoicePayment).toBe(false);

    expect(entries[2].amountCents).toBe(20000);
    expect(entries[2].suggestedEntryType).toBe('REFUND');
    expect(entries[2].possiblePreviousInvoicePayment).toBe(true);
  });

  it('detects an in-progress installment purchase from the description', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const content = buildOfx([
      { fitId: '1', date: '20260305', amount: '-100.00', name: 'LOJA ABC 03/12' },
    ]);

    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].suggestedEntryType).toBe('INSTALLMENT');
    expect(entries[0].installmentInfo).toEqual({ current: 3, total: 12 });
  });

  it('strips the "NN/MM" installment suffix from the description, keeping it only in installmentInfo', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const content = buildOfx([
      { fitId: '1', date: '20260305', amount: '-100.00', name: 'LOJA ABC 03/12' },
    ]);

    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].description).toBe('LOJA ABC');
    expect(entries[0].installmentInfo).toEqual({ current: 3, total: 12 });
  });

  it('bills a purchase made exactly on the closing day into the next invoice, not the current one', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 3 });
    const content = buildOfx([
      { fitId: '1', date: '20260703', amount: '-77.00', name: 'COMPRA NO DIA DO FECHAMENTO' },
      { fitId: '2', date: '20260702', amount: '-10.00', name: 'COMPRA UM DIA ANTES DO FECHAMENTO' },
    ]);

    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0]).toMatchObject({ targetMonth: 8, targetYear: 2026 });
    expect(entries[1]).toMatchObject({ targetMonth: 7, targetYear: 2026 });
  });

  it('flags a strong duplicate by FITID even when the stored description was edited by the user', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const now = new Date().toISOString();
    // Descrição diferente da que vem no OFX — simula o usuário tendo editado
    // o texto no preview antes de confirmar a importação da primeira vez.
    await ctx.entriesRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      creditCardId: card.id,
      description: 'Compras do mês - mercado',
      expenseCategoryId: randomUUID(),
      totalAmount: 15000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
      installmentsCount: 1,
      closingDayUsed: 10,
      notes: null,
      externalRef: '1',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const content = buildOfx([{ fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].possibleDuplicate).toBe(true);
    expect(entries[0].existingEntryId).not.toBeNull();
  });

  it('does not flag a false duplicate after the matching entry was cleared (soft-deleted) — reimporting the same FITID', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo);

    // Primeira importação
    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'MERCADO XYZ',
          amountCents: -15000,
          entryType: 'CASH',
          categoryId: category.id,
          createFutureInstallments: false,
          externalRef: '1',
        },
      ],
    });

    // "Limpar Fatura": soft-delete via CreditCardsService.deleteEntry, exatamente
    // como o frontend faz — nunca remove fisicamente o registro.
    const [entry] = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    await ctx.creditCardsService.deleteEntry(card.id, entry.id, TENANT_ID);

    const content = buildOfx([{ fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].possibleDuplicate).toBe(false);
    expect(entries[0].existingEntryId).toBeNull();
  });

  it('flags a weak duplicate by month/year/amount even when the OFX has no FITID and the stored description differs', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const now = new Date().toISOString();
    const entryId = randomUUID();
    await ctx.entriesRepo.create({
      id: entryId,
      tenantId: TENANT_ID,
      creditCardId: card.id,
      description: 'Compras do mês - mercado',
      expenseCategoryId: randomUUID(),
      totalAmount: 15000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
      installmentsCount: 1,
      closingDayUsed: 10,
      notes: null,
      externalRef: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.installmentsRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      creditCardEntryId: entryId,
      installmentNumber: 1,
      totalInstallments: 1,
      amount: 15000,
      month: 3,
      year: 2026,
      status: InstallmentStatus.OPEN,
      creditCardInvoiceId: null,
      createdAt: now,
      updatedAt: now,
    });

    const content = buildOfx([{ fitId: '', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].possibleDuplicate).toBe(true);
  });

  it('falls back to the existing "outros" category when the AI response is not valid JSON', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await seedCategory(ctx.categoriesRepo);
    const fallback = await seedFallbackCategory(ctx.categoriesRepo);
    ctx.aiProvider.enqueue({ text: 'não sei responder isso' });

    const categoriesBefore = await ctx.categoriesRepo.findAll(TENANT_ID);
    const content = buildOfx([{ fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].suggestedCategoryId).toBe(fallback.id);
    // A importação nunca cria uma categoria nova.
    expect(await ctx.categoriesRepo.findAll(TENANT_ID)).toHaveLength(categoriesBefore.length);
  });

  it('leaves the suggestion empty (no fallback) when the tenant has no "outros"-like category at all', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await seedCategory(ctx.categoriesRepo, { name: 'Mercado' });
    ctx.aiProvider.enqueue({ text: 'não sei responder isso' });

    const content = buildOfx([{ fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].suggestedCategoryId).toBeNull();
  });

  it('applies a valid AI category suggestion, falling back to the existing "outros" category for unknown category ids', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo, { name: 'Mercado' });
    const fallback = await seedFallbackCategory(ctx.categoriesRepo);
    ctx.aiProvider.enqueue({
      text: JSON.stringify([
        { index: 0, categoryId: category.id },
        { index: 1, categoryId: 'id-que-nao-existe' },
      ]),
    });

    const content = buildOfx([
      { fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' },
      { fitId: '2', date: '20260306', amount: '-30.00', name: 'OUTRA COMPRA' },
    ]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].suggestedCategoryId).toBe(category.id);
    expect(entries[1].suggestedCategoryId).toBe(fallback.id);
  });
});

describe('CreditCardInvoiceImportService — confirmImport', () => {
  let ctx: ReturnType<typeof buildContext>;

  beforeEach(() => {
    ctx = buildContext();
  });

  it('creates a REFUND entry with a negative amount, reducing the invoice total', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo);

    await ctx.creditCardsService.createEntry(card.id, TENANT_ID, {
      description: 'Compra grande',
      expenseCategoryId: category.id,
      totalAmount: 200000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });

    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-06',
          description: 'Estorno de compra',
          amountCents: 50000,
          entryType: 'REFUND',
          categoryId: category.id,
          createFutureInstallments: false,
        },
      ],
    });

    const invoices = await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(150000);
  });

  it('creates only the remaining installments (current..total) for an in-progress installment purchase', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo);

    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'LOJA ABC 03/12',
          amountCents: -10000,
          entryType: 'INSTALLMENT',
          categoryId: category.id,
          createFutureInstallments: true,
          installmentInfo: { current: 3, total: 12 },
        },
      ],
    });

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].installmentsCount).toBe(12);
    expect(entries[0].totalAmount).toBe(120000);

    const installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, entries[0].id);
    expect(installments).toHaveLength(10); // parcelas 3 a 12
    expect(installments.map((i) => i.installmentNumber).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 3),
    );
    expect(installments[0].month).toBe(3);
    expect(installments[0].year).toBe(2026);
  });

  it('creates a single CASH installment when the user opts out of future installments', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo);

    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'LOJA ABC 03/12',
          amountCents: -10000,
          entryType: 'INSTALLMENT',
          categoryId: category.id,
          createFutureInstallments: false,
          installmentInfo: { current: 3, total: 12 },
        },
      ],
    });

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(entries[0].installmentsCount).toBe(1);
    expect(entries[0].totalAmount).toBe(10000);
  });

  it('falls back to the existing "outros" category when the row categoryId does not exist, without failing the batch or creating a category', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const fallback = await seedFallbackCategory(ctx.categoriesRepo);
    const categoriesBefore = await ctx.categoriesRepo.findAll(TENANT_ID);

    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'MERCADO XYZ',
          amountCents: -15000,
          entryType: 'CASH',
          categoryId: randomUUID(),
          createFutureInstallments: false,
        },
      ],
    });

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].expenseCategoryId).toBe(fallback.id);
    // A importação nunca cria uma categoria nova.
    expect(await ctx.categoriesRepo.findAll(TENANT_ID)).toHaveLength(categoriesBefore.length);
  });

  it('rejects the import when the categoryId is invalid and the tenant has no "outros" category to fall back to', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });

    await expect(
      ctx.importService.confirmImport(card.id, TENANT_ID, {
        entries: [
          {
            date: '2026-03-05',
            description: 'MERCADO XYZ',
            amountCents: -15000,
            entryType: 'CASH',
            categoryId: randomUUID(),
            createFutureInstallments: false,
          },
        ],
      }),
    ).rejects.toThrow();

    expect(await ctx.categoriesRepo.findAll(TENANT_ID)).toHaveLength(0);
  });

  it('overwrites the existing entry (same FITID) instead of creating a duplicate, replacing future installments', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo);

    // 1ª importação: parcela em andamento, usuário marca gerar as futuras.
    await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'LOJA ABC 03/12',
          amountCents: -10000,
          entryType: 'INSTALLMENT',
          categoryId: category.id,
          createFutureInstallments: true,
          installmentInfo: { current: 3, total: 12 },
          externalRef: 'fit-1',
        },
      ],
    });

    const [firstEntry] = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(firstEntry.installmentsCount).toBe(12);
    let installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, firstEntry.id);
    expect(installments.filter((i) => i.status !== InstallmentStatus.CANCELED)).toHaveLength(10);

    // Reimportação do mesmo FITID, agora sem marcar gerar futuras — deve
    // sobrescrever o mesmo entry (não criar um novo) e cancelar as parcelas
    // futuras geradas anteriormente.
    const result = await ctx.importService.confirmImport(card.id, TENANT_ID, {
      entries: [
        {
          date: '2026-03-05',
          description: 'LOJA ABC',
          amountCents: -10000,
          entryType: 'CASH',
          categoryId: category.id,
          createFutureInstallments: false,
          externalRef: 'fit-1',
          overwriteEntryId: firstEntry.id,
        },
      ],
    });

    expect(result).toEqual({ created: 0, updated: 1 });

    const allEntries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(allEntries).toHaveLength(1); // não criou um segundo entry
    expect(allEntries[0].id).toBe(firstEntry.id);
    expect(allEntries[0].entryType).toBe(CardEntryType.CASH);
    expect(allEntries[0].installmentsCount).toBe(1);

    installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, firstEntry.id);
    const active = installments.filter((i) => i.status !== InstallmentStatus.CANCELED);
    expect(active).toHaveLength(1);
    expect(active[0].amount).toBe(10000);
  });
});
