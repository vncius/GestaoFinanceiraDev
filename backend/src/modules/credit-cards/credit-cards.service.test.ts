import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreditCardsService } from './credit-cards.service';
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
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { FinancialTransaction, OriginType, TransactionType, TransactionStatus } from '../financial-transactions/financial-transactions.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';

const TENANT_ID = 'test-tenant-1';

// Fake em memória: implementa o mesmo contrato dos repositórios de arquivo,
// permitindo testar as regras de negócio do service sem tocar o disco.
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

class FakeCategoriesRepo extends InMemoryRepo<Category> implements CategoriesRepository {
  async findActive(tenantId: string) {
    return this.items.filter((c) => c.tenantId === tenantId && c.active);
  }
  async findByType(tenantId: string, type: CategoryType) {
    return this.items.filter((c) => c.tenantId === tenantId && c.type === type);
  }
}

function buildService() {
  const cardsRepo = new FakeCardsRepo();
  const entriesRepo = new FakeEntriesRepo();
  const installmentsRepo = new FakeInstallmentsRepo();
  const invoicesRepo = new FakeInvoicesRepo();
  const transactionsRepo = new FakeTransactionsRepo();
  const settingsRepo = new FakeSettingsRepo();
  const categoriesRepo = new FakeCategoriesRepo();

  const service = new CreditCardsService(
    cardsRepo,
    entriesRepo,
    installmentsRepo,
    invoicesRepo,
    transactionsRepo,
    settingsRepo,
    categoriesRepo,
  );

  return { service, cardsRepo, entriesRepo, installmentsRepo, invoicesRepo, transactionsRepo, categoriesRepo };
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

describe('CreditCardsService — invoice month assignment', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('assigns a purchase made before closing day to the current month', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra à vista',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    expect(installments).toHaveLength(1);
    expect(installments[0].month).toBe(3);
    expect(installments[0].year).toBe(2026);
  });

  it('rolls a purchase made after closing day to the next invoice month', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra à vista',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-15',
      entryType: CardEntryType.CASH,
    });
    expect(installments[0].month).toBe(4);
    expect(installments[0].year).toBe(2026);
  });

  it('rolls a December purchase after closing day into January of the next year', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra à vista',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-12-20',
      entryType: CardEntryType.CASH,
    });
    expect(installments[0].month).toBe(1);
    expect(installments[0].year).toBe(2027);
  });
});

describe('CreditCardsService — installment splitting and invoice totals', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('splits an installment purchase across consecutive months, remainder on the first', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 1000, // 10.00, doesn't divide evenly by 3
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3,
    });

    expect(installments).toHaveLength(3);
    expect(installments.reduce((s, i) => s + i.amount, 0)).toBe(1000);
    expect(installments[0].amount).toBe(334); // 333 + 1 (remainder)
    expect(installments[1].amount).toBe(333);
    expect(installments[2].amount).toBe(333);
    expect(installments.map((i) => i.month)).toEqual([3, 4, 5]);
  });

  it('creates one invoice per distinct month and sets its totalAmount from the installments', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 3000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3,
    });

    const invoices = await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id);
    expect(invoices).toHaveLength(3);
    for (const invoice of invoices) {
      expect(invoice.totalAmount).toBe(1000);
    }
  });

  it('recalculates the invoice total after a second purchase lands in the same month', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra 1',
      expenseCategoryId: category.id,
      totalAmount: 5000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra 2',
      expenseCategoryId: category.id,
      totalAmount: 2500,
      purchaseDate: '2026-03-06',
      entryType: CardEntryType.CASH,
    });

    const invoices = await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(7500);
  });

  it('excludes canceled installments from the invoice total after deleting an entry', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra a cancelar',
      expenseCategoryId: category.id,
      totalAmount: 5000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });

    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID);

    const invoices = await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id);
    expect(invoices[0].totalAmount).toBe(0);
    const installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, entry.id);
    expect(installments[0].status).toBe(InstallmentStatus.CANCELED);
  });
});

describe('CreditCardsService — REFUND (estorno)', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('subtracts a REFUND entry from the invoice total (fatura 2000 - estorno 500 = 1500)', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra grande',
      expenseCategoryId: category.id,
      totalAmount: 200000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Estorno de compra',
      expenseCategoryId: category.id,
      totalAmount: -50000,
      purchaseDate: '2026-03-06',
      entryType: CardEntryType.REFUND,
    });

    const invoices = await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(150000);
  });

  it('creates a single installment for a REFUND entry, ignoring installmentsCount', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Estorno',
      expenseCategoryId: category.id,
      totalAmount: -10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.REFUND,
    });

    expect(installments).toHaveLength(1);
    expect(installments[0].amount).toBe(-10000);
  });

  it('rejects updating an entry to REFUND with a positive amount', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });

    await expect(
      ctx.service.updateEntry(card.id, entry.id, TENANT_ID, {
        entryType: CardEntryType.REFUND,
        totalAmount: 10000,
      }),
    ).rejects.toThrow();
  });
});

describe('CreditCardsService — category validation', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('rejects creating an entry with a category that does not exist', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await expect(
      ctx.service.createEntry(card.id, TENANT_ID, {
        description: 'Compra',
        expenseCategoryId: randomUUID(),
        totalAmount: 10000,
        purchaseDate: '2026-03-05',
        entryType: CardEntryType.CASH,
      }),
    ).rejects.toThrow();
  });

  it('rejects creating an entry with an inactive category', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const inactive = await seedCategory(ctx.categoriesRepo, { active: false });
    await expect(
      ctx.service.createEntry(card.id, TENANT_ID, {
        description: 'Compra',
        expenseCategoryId: inactive.id,
        totalAmount: 10000,
        purchaseDate: '2026-03-05',
        entryType: CardEntryType.CASH,
      }),
    ).rejects.toThrow();
  });

  it('rejects creating an entry with an INCOME category', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const income = await seedCategory(ctx.categoriesRepo, { type: CategoryType.INCOME });
    await expect(
      ctx.service.createEntry(card.id, TENANT_ID, {
        description: 'Compra',
        expenseCategoryId: income.id,
        totalAmount: 10000,
        purchaseDate: '2026-03-05',
        entryType: CardEntryType.CASH,
      }),
    ).rejects.toThrow();
  });

  it('rejects updating an entry to an invalid category', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    await expect(
      ctx.service.updateEntry(card.id, entry.id, TENANT_ID, { expenseCategoryId: randomUUID() }),
    ).rejects.toThrow();
  });
});

describe('CreditCardsService — invoice payment (PAYMENT entry)', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('creates an internal PAYMENT credit entry that zeroes the open balance without changing the gross invoice total', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    const invoice = (await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id))[0];

    await ctx.service.payInvoice(card.id, invoice.id, TENANT_ID, {});

    const paidInvoice = await ctx.invoicesRepo.findById(invoice.id, TENANT_ID);
    expect(paidInvoice?.totalAmount).toBe(10000); // valor bruto preservado

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    const paymentEntry = entries.find((e) => e.entryType === CardEntryType.PAYMENT);
    expect(paymentEntry).toBeDefined();
    expect(paymentEntry?.totalAmount).toBe(-10000);

    const flow = await ctx.service.getCardFlow(card.id, TENANT_ID, invoice.month, invoice.year);
    expect(flow.summary.invoiceTotal).toBe(10000);
    expect(flow.summary.paidAmount).toBe(10000);
    expect(flow.summary.openAmount).toBe(0);
    expect(flow.entries.some((e) => e.entryType === CardEntryType.PAYMENT)).toBe(true);
  });

  it('reverting a paid invoice cancels the internal PAYMENT entry and reopens the invoice', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    const invoice = (await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id))[0];
    await ctx.service.payInvoice(card.id, invoice.id, TENANT_ID, {});

    await ctx.service.revertInvoice(card.id, invoice.id, TENANT_ID);

    const reverted = await ctx.invoicesRepo.findById(invoice.id, TENANT_ID);
    expect(reverted?.status).toBe(InvoiceStatus.OPEN);
    expect(reverted?.totalAmount).toBe(10000);

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    const paymentEntry = entries.find((e) => e.entryType === CardEntryType.PAYMENT);
    expect(paymentEntry?.active).toBe(false);

    const flow = await ctx.service.getCardFlow(card.id, TENANT_ID, invoice.month, invoice.year);
    expect(flow.summary.paidAmount).toBe(0);
    expect(flow.summary.openAmount).toBe(10000);
  });

  it('editing an entry from an already-paid invoice reverts the payment automatically', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    const invoice = (await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id))[0];
    await ctx.service.payInvoice(card.id, invoice.id, TENANT_ID, {});

    await ctx.service.updateEntry(card.id, entry.id, TENANT_ID, { totalAmount: 20000 });

    const reverted = await ctx.invoicesRepo.findById(invoice.id, TENANT_ID);
    expect(reverted?.status).toBe(InvoiceStatus.OPEN);
    expect(reverted?.totalAmount).toBe(20000);

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    const paymentEntry = entries.find((e) => e.entryType === CardEntryType.PAYMENT);
    expect(paymentEntry?.active).toBe(false);
  });

  it('rejects editing or deleting a PAYMENT entry directly', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    const invoice = (await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id))[0];
    await ctx.service.payInvoice(card.id, invoice.id, TENANT_ID, {});

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    const paymentEntry = entries.find((e) => e.entryType === CardEntryType.PAYMENT)!;

    await expect(
      ctx.service.updateEntry(card.id, paymentEntry.id, TENANT_ID, { description: 'x' }),
    ).rejects.toThrow();
    await expect(ctx.service.deleteEntry(card.id, paymentEntry.id, TENANT_ID)).rejects.toThrow();
  });

  it('does not create a PAYMENT entry for a zero-value invoice', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const now = new Date().toISOString();
    const invoice = await ctx.invoicesRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      creditCardId: card.id,
      month: 3,
      year: 2026,
      dueDate: now,
      totalAmount: 0,
      status: InvoiceStatus.OPEN,
      paymentDate: null,
      paymentAccountId: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.service.payInvoice(card.id, invoice.id, TENANT_ID, {});

    const entries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    expect(entries.some((e) => e.entryType === CardEntryType.PAYMENT)).toBe(false);
  });

  it('treats a legacy invoice marked PAID without a PAYMENT entry as fully paid in the summary', async () => {
    // Simula uma fatura paga antes do lançamento PAYMENT existir: status
    // PAID persistido diretamente, sem passar por payInvoice.
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra',
      expenseCategoryId: category.id,
      totalAmount: 10000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    const invoice = (await ctx.invoicesRepo.findByCardId(TENANT_ID, card.id))[0];
    await ctx.invoicesRepo.update(invoice.id, { status: InvoiceStatus.PAID }, TENANT_ID);

    const flow = await ctx.service.getCardFlow(card.id, TENANT_ID, invoice.month, invoice.year);
    expect(flow.summary.invoiceTotal).toBe(10000);
    expect(flow.summary.paidAmount).toBe(10000);
    expect(flow.summary.openAmount).toBe(0);
  });

  it('deleting an installment entry that spans an already-paid month reverts that invoice payment instead of leaving it stale', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    // Uma compra parcelada em 3x cria parcelas em março, abril e maio.
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 3000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3,
    });

    // Março (mês mais antigo) já foi pago antes da exclusão.
    const marchInvoice = (await ctx.invoicesRepo.findByCardAndMonth(TENANT_ID, card.id, 3, 2026))!;
    await ctx.service.payInvoice(card.id, marchInvoice.id, TENANT_ID, {});

    // Exclusão disparada a partir de março (o próprio mês mais antigo) —
    // cancela as 3 parcelas de uma vez, já que não sobra nada anterior.
    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID, undefined, 3, 2026);

    const revertedMarch = await ctx.invoicesRepo.findById(marchInvoice.id, TENANT_ID);
    expect(revertedMarch?.status).toBe(InvoiceStatus.OPEN);
    expect(revertedMarch?.paymentDate).toBeNull();
    expect(revertedMarch?.totalAmount).toBe(0);

    // O lançamento PAYMENT interno de março também é desfeito.
    const marchEntries = await ctx.entriesRepo.findByCardId(TENANT_ID, card.id);
    const paymentEntry = marchEntries.find((e) => e.entryType === CardEntryType.PAYMENT);
    expect(paymentEntry?.active).toBe(false);
  });

  it('deleting a fixed entry (CURRENT_AND_FUTURE) reverts payment for any already-paid month in scope', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Assinatura',
      expenseCategoryId: category.id,
      totalAmount: 1000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.FIXED,
    });
    await ctx.service.getCardFlow(card.id, TENANT_ID, 4, 2026); // garante referência de abril

    const marchInvoice = (await ctx.invoicesRepo.findByCardAndMonth(TENANT_ID, card.id, 3, 2026))!;
    await ctx.service.payInvoice(card.id, marchInvoice.id, TENANT_ID, {});

    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID, 'CURRENT_AND_FUTURE', 3, 2026);

    const reverted = await ctx.invoicesRepo.findById(marchInvoice.id, TENANT_ID);
    expect(reverted?.status).toBe(InvoiceStatus.OPEN);
    expect(reverted?.totalAmount).toBe(0);
  });
});

describe('CreditCardsService — installment deletion scoped to reference month', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('deleting from a future reference month cancels that month forward, preserving earlier installments', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 5000,
      purchaseDate: '2026-08-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 5, // ago, set, out, nov, dez
    });

    // Exclusão disparada a partir de dezembro (a referência que o usuário
    // está vendo na tela) — agosto a novembro devem continuar intactos.
    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID, undefined, 12, 2026);

    const installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, entry.id);
    const active = installments.filter((i) => i.status !== InstallmentStatus.CANCELED);
    expect(active.map((i) => i.month).sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
    const canceled = installments.filter((i) => i.status === InstallmentStatus.CANCELED);
    expect(canceled.map((i) => i.month)).toEqual([12]);

    // Como restaram parcelas anteriores à referência, o lançamento continua ativo.
    const updatedEntry = await ctx.entriesRepo.findById(entry.id, TENANT_ID);
    expect(updatedEntry?.active).toBe(true);

    // Faturas de agosto a novembro não foram tocadas.
    const novInvoice = await ctx.invoicesRepo.findByCardAndMonth(TENANT_ID, card.id, 11, 2026);
    expect(novInvoice?.totalAmount).toBe(1000);
  });

  it('deleting from the first reference month cancels everything and deactivates the entry', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 3000,
      purchaseDate: '2026-08-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3, // ago, set, out
    });

    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID, undefined, 8, 2026);

    const installments = await ctx.installmentsRepo.findByEntryId(TENANT_ID, entry.id);
    expect(installments.every((i) => i.status === InstallmentStatus.CANCELED)).toBe(true);
    const updatedEntry = await ctx.entriesRepo.findById(entry.id, TENANT_ID);
    expect(updatedEntry?.active).toBe(false);
  });

  it('requires a reference month/year to delete an installment entry', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 3000,
      purchaseDate: '2026-08-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3,
    });

    await expect(ctx.service.deleteEntry(card.id, entry.id, TENANT_ID)).rejects.toThrow();
  });

  it('reverts an already-paid month caught in the deletion range instead of leaving it stale', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Compra parcelada',
      expenseCategoryId: category.id,
      totalAmount: 3000,
      purchaseDate: '2026-08-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3, // ago, set, out
    });

    const octInvoice = (await ctx.invoicesRepo.findByCardAndMonth(TENANT_ID, card.id, 10, 2026))!;
    await ctx.service.payInvoice(card.id, octInvoice.id, TENANT_ID, {});

    // Exclui a partir de setembro — outubro (pago) entra no range cancelado.
    await ctx.service.deleteEntry(card.id, entry.id, TENANT_ID, undefined, 9, 2026);

    const revertedOct = await ctx.invoicesRepo.findById(octInvoice.id, TENANT_ID);
    expect(revertedOct?.status).toBe(InvoiceStatus.OPEN);
  });
});

describe('CreditCardsService — concurrency in fixed entry installment extension', () => {
  let ctx: ReturnType<typeof buildService>;
  let category: Category;

  beforeEach(async () => {
    ctx = buildService();
    category = await seedCategory(ctx.categoriesRepo);
  });

  it('two concurrent requests extending the same fixed entry to the same month never create duplicate installments', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, TENANT_ID, {
      description: 'Assinatura',
      expenseCategoryId: category.id,
      totalAmount: 1000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.FIXED,
    });

    // Simula a lista de cartões (findAll) e o detalhe do cartão (getCardFlow)
    // carregando ao mesmo tempo e ambos estendendo o mesmo lançamento fixo
    // até o mesmo mês futuro ainda não materializado.
    await Promise.all([
      ctx.service.getCardFlow(card.id, TENANT_ID, 6, 2026),
      ctx.service.getCardFlow(card.id, TENANT_ID, 6, 2026),
    ]);

    const installments = await ctx.installmentsRepo.findAll(TENANT_ID);
    const june = installments.filter(
      (i) => i.month === 6 && i.year === 2026 && i.status !== InstallmentStatus.CANCELED,
    );
    expect(june).toHaveLength(1);
  });
});
