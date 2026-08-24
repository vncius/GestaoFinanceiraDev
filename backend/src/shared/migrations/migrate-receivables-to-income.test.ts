import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateReceivablesToIncome, MigrationRepos } from './migrate-receivables-to-income';
import { ReceivablesRepository } from '../../modules/receivables/receivables.repository';
import { Receivable, ReceivableStatus, RecurrenceType } from '../../modules/receivables/receivables.types';
import { FinancialTransactionsRepository } from '../../modules/financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  TransactionStatus,
  TransactionType,
} from '../../modules/financial-transactions/financial-transactions.types';
import { SettingsRepository } from '../../modules/settings/settings.repository';
import { FinancialSettings } from '../../modules/settings/settings.types';
import { calcAccountBalance } from '../utils/balance.utils';

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

class FakeReceivablesRepo extends InMemoryRepo<Receivable> implements ReceivablesRepository {
  async findByMonth(tenantId: string, month: number, year: number) {
    return this.items.filter((r) => {
      if (r.tenantId !== tenantId) return false;
      const [y, m] = r.expectedPaymentDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }
  async findByStatus(tenantId: string, status: ReceivableStatus) {
    return this.items.filter((r) => r.tenantId === tenantId && r.status === status);
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

function buildRepos(): MigrationRepos & {
  receivablesRepo: FakeReceivablesRepo;
  transactionsRepo: FakeTransactionsRepo;
  settingsRepo: FakeSettingsRepo;
} {
  return {
    receivablesRepo: new FakeReceivablesRepo(),
    transactionsRepo: new FakeTransactionsRepo(),
    settingsRepo: new FakeSettingsRepo(),
  };
}

function baseReceivable(overrides: Partial<Receivable> = {}): Receivable {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: TENANT_ID,
    description: 'Salário',
    expectedPaymentDate: '2026-08-05T00:00:00.000Z',
    actualPaymentDate: null,
    grossAmount: 500000,
    reserveAllocations: [],
    reserveAmount: 0,
    netAmount: 500000,
    status: ReceivableStatus.EXPECTED,
    incomeCategoryId: randomUUID(),
    notes: null,
    recurrence: RecurrenceType.UNIQUE,
    recurringGroupId: null,
    recurringActive: true,
    customerName: null,
    invoiceNumber: null,
    invoiceCode: null,
    invoiceLink: null,
    invoiceIssueDate: null,
    competence: null,
    workedHours: null,
    hourlyRate: null,
    targetAccountId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('migrateReceivablesToIncome', () => {
  let repos: ReturnType<typeof buildRepos>;

  beforeEach(() => {
    repos = buildRepos();
  });

  it('EXPECTED vira INCOME pendente com valor bruto, reaproveitando o id', async () => {
    const account = randomUUID();
    const receivable = await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.EXPECTED, targetAccountId: account, grossAmount: 500000, netAmount: 480000 }),
    );

    const report = await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    expect(report.convertedFromExpected).toBe(1);
    const tx = await repos.transactionsRepo.findById(receivable.id, TENANT_ID);
    expect(tx).toBeDefined();
    expect(tx?.type).toBe(TransactionType.INCOME);
    expect(tx?.status).toBe(TransactionStatus.PENDING);
    expect(tx?.amount).toBe(500000); // bruto, não líquido — reserva não migra (D4b)
    expect(tx?.targetAccountId).toBe(account);
    expect(tx?.originType).toBeNull();
  });

  it('EXPECTED usa settings.mainAccountId quando o Receivable não tem targetAccountId', async () => {
    const mainAccount = randomUUID();
    await repos.settingsRepo.upsert({
      id: randomUUID(),
      tenantId: TENANT_ID,
      mainAccountId: mainAccount,
      minimumMainBalance: 0,
      annualRevenueLimit: 0,
      controlStartMonth: 1,
      controlStartYear: 2026,
      pjLimitControlEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const receivable = await repos.receivablesRepo.create(baseReceivable({ targetAccountId: null }));

    await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    const tx = await repos.transactionsRepo.findById(receivable.id, TENANT_ID);
    expect(tx?.targetAccountId).toBe(mainAccount);
  });

  it('RECEIVED normaliza a transação já materializada (limpa origin, preserva valor líquido)', async () => {
    const account = randomUUID();
    const receivable = await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.RECEIVED, netAmount: 480000, targetAccountId: account }),
    );
    const incomeTx = await repos.transactionsRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      type: TransactionType.INCOME,
      description: `Recebimento: ${receivable.description}`,
      categoryId: receivable.incomeCategoryId,
      amount: 480000,
      expectedDate: receivable.expectedPaymentDate,
      actualDate: new Date().toISOString(),
      status: TransactionStatus.RECEIVED,
      sourceAccountId: null,
      targetAccountId: account,
      originType: OriginType.RECEIVABLE,
      originId: receivable.id,
      notes: null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Reserva histórica vinculada ao mesmo Receivable — deve ficar intocada.
    const reserveTx = await repos.transactionsRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      type: TransactionType.RESERVE,
      description: `Reserva: ${receivable.description}`,
      categoryId: null,
      amount: 20000,
      expectedDate: receivable.expectedPaymentDate,
      actualDate: new Date().toISOString(),
      status: TransactionStatus.RECEIVED,
      sourceAccountId: null,
      targetAccountId: randomUUID(),
      originType: OriginType.RECEIVABLE,
      originId: receivable.id,
      notes: null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    expect(report.normalizedFromReceived).toBe(1);
    const updatedIncome = await repos.transactionsRepo.findById(incomeTx.id, TENANT_ID);
    expect(updatedIncome?.originType).toBeNull();
    expect(updatedIncome?.originId).toBeNull();
    expect(updatedIncome?.amount).toBe(480000); // líquido, não inflado para bruto
    expect(updatedIncome?.targetAccountId).toBe(account);

    const untouchedReserve = await repos.transactionsRepo.findById(reserveTx.id, TENANT_ID);
    expect(untouchedReserve?.originType).toBe(OriginType.RECEIVABLE);
    expect(untouchedReserve?.amount).toBe(20000);
  });

  it('CANCELED é ignorado', async () => {
    await repos.receivablesRepo.create(baseReceivable({ status: ReceivableStatus.CANCELED }));

    const report = await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    expect(report.ignoredCanceled).toBe(1);
    expect(report.convertedFromExpected).toBe(0);
    expect((await repos.transactionsRepo.findAll(TENANT_ID)).length).toBe(0);
  });

  it('conta registros com dados de NF preenchidos, mas não migra os campos', async () => {
    await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.EXPECTED, invoiceNumber: 'NF-123', customerName: 'Cliente X' }),
    );

    const report = await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    expect(report.nfDataDiscarded).toBe(1);
  });

  it('dry-run não grava nada', async () => {
    await repos.receivablesRepo.create(baseReceivable({ status: ReceivableStatus.EXPECTED }));

    const report = await migrateReceivablesToIncome(TENANT_ID, { dryRun: true }, repos);

    expect(report.convertedFromExpected).toBe(1);
    expect((await repos.transactionsRepo.findAll(TENANT_ID)).length).toBe(0);
  });

  it('é idempotente: rodar duas vezes não duplica nem altera o resultado', async () => {
    const account = randomUUID();
    await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.EXPECTED, targetAccountId: account, grossAmount: 300000 }),
    );

    await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);
    const afterFirst = [...repos.transactionsRepo.items];

    const secondReport = await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    expect(secondReport.convertedFromExpected).toBe(0);
    expect(secondReport.alreadyConvertedExpected).toBe(1);
    expect(repos.transactionsRepo.items).toEqual(afterFirst);
  });

  it('saldo da conta permanece idêntico antes e depois da migração', async () => {
    const account = { id: randomUUID(), initialBalance: 100000 };
    // Um RECEIVED (já afeta saldo hoje) e um EXPECTED (pendente, não afeta saldo).
    const received = await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.RECEIVED, netAmount: 400000, targetAccountId: account.id }),
    );
    await repos.transactionsRepo.create({
      id: randomUUID(),
      tenantId: TENANT_ID,
      type: TransactionType.INCOME,
      description: `Recebimento: ${received.description}`,
      categoryId: received.incomeCategoryId,
      amount: 400000,
      expectedDate: received.expectedPaymentDate,
      actualDate: new Date().toISOString(),
      status: TransactionStatus.RECEIVED,
      sourceAccountId: null,
      targetAccountId: account.id,
      originType: OriginType.RECEIVABLE,
      originId: received.id,
      notes: null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repos.receivablesRepo.create(
      baseReceivable({ status: ReceivableStatus.EXPECTED, targetAccountId: account.id, grossAmount: 999999 }),
    );

    const before = calcAccountBalance(account, await repos.transactionsRepo.findAll(TENANT_ID));

    await migrateReceivablesToIncome(TENANT_ID, { dryRun: false }, repos);

    const after = calcAccountBalance(account, await repos.transactionsRepo.findAll(TENANT_ID));
    expect(after).toBe(before);
  });
});
