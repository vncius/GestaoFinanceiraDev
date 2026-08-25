import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CashFlowService } from './cash-flow.service';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { Account } from '../accounts/accounts.types';
import { SettingsRepository } from '../settings/settings.repository';
import { FinancialSettings } from '../settings/settings.types';

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

class FakeTransactionsRepo extends InMemoryRepo<FinancialTransaction> implements FinancialTransactionsRepository {
  async createMany(items: FinancialTransaction[]) {
    this.items.push(...items);
    return items;
  }
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

class FakeAccountsRepo extends InMemoryRepo<Account> implements AccountsRepository {
  async findActive(tenantId: string) {
    return this.items.filter((a) => a.tenantId === tenantId && a.active);
  }
}

class FakeSettingsRepo implements SettingsRepository {
  settings: FinancialSettings | null = null;
  async get() {
    return this.settings;
  }
  async upsert(data: FinancialSettings) {
    this.settings = data;
    return data;
  }
  async deleteAll() {
    this.settings = null;
  }
}

function buildService() {
  const transactionsRepo = new FakeTransactionsRepo();
  const accountsRepo = new FakeAccountsRepo();
  const settingsRepo = new FakeSettingsRepo();

  const service = new CashFlowService(transactionsRepo, accountsRepo, settingsRepo);

  return { service, transactionsRepo, accountsRepo, settingsRepo };
}

async function seedAccount(accountsRepo: FakeAccountsRepo, overrides: Partial<Account> = {}): Promise<Account> {
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    name: 'Conta Principal',
    accountTypeId: null,
    initialBalance: 0,
    initialBalanceDate: now,
    active: true,
    autoReserveEnabled: false,
    autoReservePercentage: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return accountsRepo.create(account);
}

async function setMainAccount(settingsRepo: FakeSettingsRepo, mainAccountId: string): Promise<void> {
  const now = new Date().toISOString();
  await settingsRepo.upsert({
    id: randomUUID(),
    tenantId: TENANT_ID,
    mainAccountId,
    minimumMainBalance: 0,
    annualRevenueLimit: 0,
    controlStartMonth: 1,
    controlStartYear: 2026,
    pjLimitControlEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
}

describe('CashFlowService — Income', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('createIncome cria uma transação INCOME pendente com a conta informada', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const tx = await service.createIncome(TENANT_ID, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.UNIQUE,
    });

    expect(tx.type).toBe(TransactionType.INCOME);
    expect(tx.status).toBe(TransactionStatus.PENDING);
    expect(tx.targetAccountId).toBe(account.id);
    expect(tx.sourceAccountId).toBeNull();
    expect(tx.amount).toBe(500000);
  });

  it('createIncome usa settings.mainAccountId quando targetAccountId não é informado', async () => {
    const { service, accountsRepo, settingsRepo } = ctx;
    const account = await seedAccount(accountsRepo);
    await setMainAccount(settingsRepo, account.id);

    const tx = await service.createIncome(TENANT_ID, {
      description: 'Freela',
      categoryId: randomUUID(),
      amount: 100000,
      expectedDate: '2026-08-10T00:00:00.000Z',
      recurrence: RecurrenceType.UNIQUE,
    });

    expect(tx.targetAccountId).toBe(account.id);
  });

  it('receiveIncome marca como RECEIVED e revertIncome volta para PENDING', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const created = await service.createIncome(TENANT_ID, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.UNIQUE,
    });

    const received = await service.receiveIncome(created.id, TENANT_ID, { amountReceived: 480000 });
    expect(received.status).toBe(TransactionStatus.RECEIVED);
    expect(received.amount).toBe(480000);
    expect(received.actualDate).not.toBeNull();

    await expect(service.receiveIncome(created.id, TENANT_ID, undefined)).rejects.toThrow('Lançamento já foi recebido.');

    const reverted = await service.revertIncome(created.id, TENANT_ID);
    expect(reverted.status).toBe(TransactionStatus.PENDING);
    expect(reverted.actualDate).toBeNull();
  });

  it('deleteIncome cancela um lançamento único ainda não recebido', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const created = await service.createIncome(TENANT_ID, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.UNIQUE,
    });

    await service.deleteIncome(created.id, TENANT_ID);
    const stored = await transactionsRepo.findById(created.id, TENANT_ID);
    expect(stored?.status).toBe(TransactionStatus.CANCELED);
  });

  it('deleteIncome recusa excluir um lançamento já recebido', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const created = await service.createIncome(TENANT_ID, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(created.id, TENANT_ID, undefined);

    await expect(service.deleteIncome(created.id, TENANT_ID)).rejects.toThrow(
      'Lançamentos já recebidos não podem ser excluídos. Reverta primeiro.',
    );
  });

  it('getCashFlow materializa recorrência fixa de entrada (INCOME) para o mês consultado', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    await service.createIncome(TENANT_ID, {
      description: 'Salário fixo',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-06-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.FIXED,
    });

    await service.getCashFlow(TENANT_ID, { month: 8, year: 2026 });

    const { transactionsRepo } = ctx;
    const allIncome = (await transactionsRepo.findAll(TENANT_ID)).filter((t) => t.type === TransactionType.INCOME);
    const august = allIncome.find((t) => t.expectedDate.startsWith('2026-08'));
    expect(august).toBeDefined();
    expect(august?.status).toBe(TransactionStatus.PENDING);
    expect(august?.amount).toBe(500000);
  });
});
