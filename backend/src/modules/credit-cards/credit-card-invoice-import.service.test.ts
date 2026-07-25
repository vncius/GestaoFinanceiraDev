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
    settingsRepo,
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
    protected: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return categoriesRepo.create(category);
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
      totalAmount: -15000,
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
      amount: -15000,
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

  it('falls back to no suggestion when the AI response is not valid JSON', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await seedCategory(ctx.categoriesRepo);
    ctx.aiProvider.enqueue({ text: 'não sei responder isso' });

    const content = buildOfx([{ fitId: '1', date: '20260305', amount: '-150.00', name: 'MERCADO XYZ' }]);
    const entries = await ctx.importService.parseInvoice(card.id, TENANT_ID, 'fatura.ofx', content);

    expect(entries[0].suggestedCategoryId).toBeNull();
  });

  it('applies a valid AI category suggestion, ignoring unknown category ids', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const category = await seedCategory(ctx.categoriesRepo, { name: 'Mercado' });
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
    expect(entries[1].suggestedCategoryId).toBeNull();
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
});
