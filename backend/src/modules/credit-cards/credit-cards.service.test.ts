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
} from './credit-cards.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { FinancialTransaction, OriginType, TransactionType, TransactionStatus } from '../financial-transactions/financial-transactions.types';

// Fake em memória: implementa o mesmo contrato dos repositórios de arquivo,
// permitindo testar as regras de negócio do service sem tocar o disco.
class InMemoryRepo<T extends { id: string }> {
  items: T[] = [];

  async findAll(): Promise<T[]> {
    return [...this.items];
  }

  async findById(id: string): Promise<T | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async create(data: T): Promise<T> {
    this.items.push(data);
    return data;
  }

  async createMany(dataList: T[]): Promise<T[]> {
    this.items.push(...dataList);
    return dataList;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const index = this.items.findIndex((i) => i.id === id);
    if (index === -1) throw new Error(`not found: ${id}`);
    this.items[index] = { ...this.items[index], ...data };
    return this.items[index];
  }

  async delete(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class FakeCardsRepo extends InMemoryRepo<CreditCard> implements CreditCardsRepository {
  async findActive() {
    return this.items.filter((c) => c.active);
  }
}

class FakeEntriesRepo extends InMemoryRepo<CreditCardEntry> implements CreditCardEntriesRepository {
  async findByCardId(creditCardId: string) {
    return this.items.filter((e) => e.creditCardId === creditCardId);
  }
  async findActiveByCardId(creditCardId: string) {
    return this.items.filter((e) => e.creditCardId === creditCardId && e.active);
  }
}

class FakeInstallmentsRepo extends InMemoryRepo<CreditCardInstallment> implements CreditCardInstallmentsRepository {
  async findByEntryId(entryId: string) {
    return this.items.filter((i) => i.creditCardEntryId === entryId);
  }
  async findByMonth(month: number, year: number) {
    return this.items.filter((i) => i.month === month && i.year === year);
  }
  async findByCardAndMonth() {
    return this.items;
  }
}

class FakeInvoicesRepo extends InMemoryRepo<CreditCardInvoice> implements CreditCardInvoicesRepository {
  async findByCardId(creditCardId: string) {
    return this.items.filter((i) => i.creditCardId === creditCardId);
  }
  async findByCardAndMonth(creditCardId: string, month: number, year: number) {
    return (
      this.items.find(
        (i) => i.creditCardId === creditCardId && i.month === month && i.year === year,
      ) ?? null
    );
  }
}

class FakeTransactionsRepo extends InMemoryRepo<FinancialTransaction> implements FinancialTransactionsRepository {
  async findByMonth(month: number, year: number) {
    return this.items.filter((t) => {
      const [y, m] = t.expectedDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }
  async findByType(type: TransactionType) {
    return this.items.filter((t) => t.type === type);
  }
  async findByStatus(status: TransactionStatus) {
    return this.items.filter((t) => t.status === status);
  }
  async findByOrigin(originType: OriginType, originId: string) {
    return this.items.filter((t) => t.originType === originType && t.originId === originId);
  }
}

class FakeSettingsRepo implements SettingsRepository {
  async get() {
    return null;
  }
  async upsert(data: never) {
    return data;
  }
}

function buildService() {
  const cardsRepo = new FakeCardsRepo();
  const entriesRepo = new FakeEntriesRepo();
  const installmentsRepo = new FakeInstallmentsRepo();
  const invoicesRepo = new FakeInvoicesRepo();
  const transactionsRepo = new FakeTransactionsRepo();
  const settingsRepo = new FakeSettingsRepo();

  const service = new CreditCardsService(
    cardsRepo,
    entriesRepo,
    installmentsRepo,
    invoicesRepo,
    transactionsRepo,
    settingsRepo,
  );

  return { service, cardsRepo, entriesRepo, installmentsRepo, invoicesRepo };
}

async function seedCard(cardsRepo: FakeCardsRepo, overrides: Partial<CreditCard> = {}): Promise<CreditCard> {
  const now = new Date().toISOString();
  const card: CreditCard = {
    id: randomUUID(),
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

describe('CreditCardsService — invoice month assignment', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('assigns a purchase made before closing day to the current month', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, {
      description: 'Compra à vista',
      expenseCategoryId: randomUUID(),
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
    const { installments } = await ctx.service.createEntry(card.id, {
      description: 'Compra à vista',
      expenseCategoryId: randomUUID(),
      totalAmount: 10000,
      purchaseDate: '2026-03-15',
      entryType: CardEntryType.CASH,
    });
    expect(installments[0].month).toBe(4);
    expect(installments[0].year).toBe(2026);
  });

  it('rolls a December purchase after closing day into January of the next year', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, {
      description: 'Compra à vista',
      expenseCategoryId: randomUUID(),
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

  beforeEach(() => {
    ctx = buildService();
  });

  it('splits an installment purchase across consecutive months, remainder on the first', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { installments } = await ctx.service.createEntry(card.id, {
      description: 'Compra parcelada',
      expenseCategoryId: randomUUID(),
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
    await ctx.service.createEntry(card.id, {
      description: 'Compra parcelada',
      expenseCategoryId: randomUUID(),
      totalAmount: 3000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: 3,
    });

    const invoices = await ctx.invoicesRepo.findByCardId(card.id);
    expect(invoices).toHaveLength(3);
    for (const invoice of invoices) {
      expect(invoice.totalAmount).toBe(1000);
    }
  });

  it('recalculates the invoice total after a second purchase lands in the same month', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    await ctx.service.createEntry(card.id, {
      description: 'Compra 1',
      expenseCategoryId: randomUUID(),
      totalAmount: 5000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });
    await ctx.service.createEntry(card.id, {
      description: 'Compra 2',
      expenseCategoryId: randomUUID(),
      totalAmount: 2500,
      purchaseDate: '2026-03-06',
      entryType: CardEntryType.CASH,
    });

    const invoices = await ctx.invoicesRepo.findByCardId(card.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(7500);
  });

  it('excludes canceled installments from the invoice total after deleting an entry', async () => {
    const card = await seedCard(ctx.cardsRepo, { closingDay: 10 });
    const { entry } = await ctx.service.createEntry(card.id, {
      description: 'Compra a cancelar',
      expenseCategoryId: randomUUID(),
      totalAmount: 5000,
      purchaseDate: '2026-03-05',
      entryType: CardEntryType.CASH,
    });

    await ctx.service.deleteEntry(card.id, entry.id);

    const invoices = await ctx.invoicesRepo.findByCardId(card.id);
    expect(invoices[0].totalAmount).toBe(0);
    const installments = await ctx.installmentsRepo.findByEntryId(entry.id);
    expect(installments[0].status).toBe(InstallmentStatus.CANCELED);
  });
});
