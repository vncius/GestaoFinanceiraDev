import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BackupService } from './backup.service';
import { AccountsRepository } from '../accounts/accounts.repository';
import { Account } from '../accounts/accounts.types';
import { AccountTypesRepository } from '../account-types/account-types.repository';
import { AccountType } from '../account-types/account-types.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';
import { SettingsRepository } from '../settings/settings.repository';
import { FinancialSettings } from '../settings/settings.types';
import { ReceivablesRepository } from '../receivables/receivables.repository';
import { Receivable, ReceivableStatus, RecurrenceType } from '../receivables/receivables.types';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import {
  CreditCardsRepository,
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from '../credit-cards/credit-cards.repository';
import {
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
} from '../credit-cards/credit-cards.types';
import { BackupBundle } from './backup.types';

const TENANT_ID = 'tenant-a';
const OTHER_TENANT_ID = 'tenant-b';

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

class FakeAccountsRepo extends InMemoryRepo<Account> implements AccountsRepository {
  async findActive(tenantId: string) { return this.items.filter((a) => a.tenantId === tenantId && a.active); }
}

class FakeAccountTypesRepo extends InMemoryRepo<AccountType> implements AccountTypesRepository {
  async findActive(tenantId: string) { return this.items.filter((t) => t.tenantId === tenantId && t.active); }
}

class FakeCategoriesRepo extends InMemoryRepo<Category> implements CategoriesRepository {
  async findActive(tenantId: string) { return this.items.filter((c) => c.tenantId === tenantId && c.active); }
  async findByType(tenantId: string, type: CategoryType) { return this.items.filter((c) => c.tenantId === tenantId && c.type === type); }
}

class FakeSettingsRepo implements SettingsRepository {
  items: FinancialSettings[] = [];
  async get(tenantId: string) { return this.items.find((s) => s.tenantId === tenantId) ?? null; }
  async upsert(data: FinancialSettings) {
    const index = this.items.findIndex((s) => s.tenantId === data.tenantId);
    if (index === -1) { this.items.push(data); return data; }
    this.items[index] = { ...this.items[index], ...data };
    return this.items[index];
  }
  async deleteAll(tenantId: string) {
    this.items = this.items.filter((s) => s.tenantId !== tenantId);
  }
}

class FakeReceivablesRepo extends InMemoryRepo<Receivable> implements ReceivablesRepository {
  async findByMonth(tenantId: string, month: number, year: number) {
    return this.items.filter((r) => r.tenantId === tenantId && r.expectedPaymentDate.slice(5, 7) === String(month).padStart(2, '0') && r.expectedPaymentDate.slice(0, 4) === String(year));
  }
  async findByStatus(tenantId: string, status: ReceivableStatus) { return this.items.filter((r) => r.tenantId === tenantId && r.status === status); }
}

class FakeTransactionsRepo extends InMemoryRepo<FinancialTransaction> implements FinancialTransactionsRepository {
  async findByMonth(tenantId: string, month: number, year: number) {
    return this.items.filter((t) => t.tenantId === tenantId && t.expectedDate.slice(5, 7) === String(month).padStart(2, '0') && t.expectedDate.slice(0, 4) === String(year));
  }
  async findByType(tenantId: string, type: TransactionType) { return this.items.filter((t) => t.tenantId === tenantId && t.type === type); }
  async findByStatus(tenantId: string, status: TransactionStatus) { return this.items.filter((t) => t.tenantId === tenantId && t.status === status); }
  async findByOrigin(tenantId: string, originType: never, originId: string) { return this.items.filter((t) => t.tenantId === tenantId && t.originId === originId); }
}

class FakeCreditCardsRepo extends InMemoryRepo<CreditCard> implements CreditCardsRepository {
  async findActive(tenantId: string) { return this.items.filter((c) => c.tenantId === tenantId && c.active); }
}

class FakeCreditCardEntriesRepo extends InMemoryRepo<CreditCardEntry> implements CreditCardEntriesRepository {
  async findByCardId(tenantId: string, creditCardId: string) { return this.items.filter((e) => e.tenantId === tenantId && e.creditCardId === creditCardId); }
  async findActiveByCardId(tenantId: string, creditCardId: string) { return this.items.filter((e) => e.tenantId === tenantId && e.creditCardId === creditCardId && e.active); }
}

class FakeCreditCardInstallmentsRepo extends InMemoryRepo<CreditCardInstallment> implements CreditCardInstallmentsRepository {
  async findByEntryId(tenantId: string, entryId: string) { return this.items.filter((i) => i.tenantId === tenantId && i.creditCardEntryId === entryId); }
  async findByMonth(tenantId: string, month: number, year: number) { return this.items.filter((i) => i.tenantId === tenantId && i.month === month && i.year === year); }
  async findByCardAndMonth(tenantId: string) { return this.items.filter((i) => i.tenantId === tenantId); }
}

class FakeCreditCardInvoicesRepo extends InMemoryRepo<CreditCardInvoice> implements CreditCardInvoicesRepository {
  async findByCardId(tenantId: string, creditCardId: string) { return this.items.filter((i) => i.tenantId === tenantId && i.creditCardId === creditCardId); }
  async findByCardAndMonth(tenantId: string, creditCardId: string, month: number, year: number) {
    return this.items.find((i) => i.tenantId === tenantId && i.creditCardId === creditCardId && i.month === month && i.year === year) ?? null;
  }
}

function buildService() {
  const accountsRepo = new FakeAccountsRepo();
  const accountTypesRepo = new FakeAccountTypesRepo();
  const categoriesRepo = new FakeCategoriesRepo();
  const settingsRepo = new FakeSettingsRepo();
  const receivablesRepo = new FakeReceivablesRepo();
  const transactionsRepo = new FakeTransactionsRepo();
  const creditCardsRepo = new FakeCreditCardsRepo();
  const creditCardEntriesRepo = new FakeCreditCardEntriesRepo();
  const creditCardInstallmentsRepo = new FakeCreditCardInstallmentsRepo();
  const creditCardInvoicesRepo = new FakeCreditCardInvoicesRepo();

  const service = new BackupService(
    accountsRepo,
    accountTypesRepo,
    categoriesRepo,
    settingsRepo,
    receivablesRepo,
    transactionsRepo,
    creditCardsRepo,
    creditCardEntriesRepo,
    creditCardInstallmentsRepo,
    creditCardInvoicesRepo,
  );

  return { service, accountsRepo, accountTypesRepo, categoriesRepo, settingsRepo, receivablesRepo, transactionsRepo };
}

function makeAccount(tenantId: string, overrides: Partial<Account> = {}): Account {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId,
    name: 'Conta Teste',
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
}

function makeCategory(tenantId: string, overrides: Partial<Category> = {}): Category {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId,
    name: 'Categoria Teste',
    type: CategoryType.EXPENSE,
    active: true,
    protected: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTransaction(tenantId: string, overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId,
    type: TransactionType.PAYMENT,
    description: 'Lançamento teste',
    categoryId: null,
    amount: 1000,
    expectedDate: '2026-03-10',
    actualDate: null,
    status: TransactionStatus.PAID,
    sourceAccountId: null,
    targetAccountId: null,
    originType: null,
    originId: null,
    notes: null,
    recurrence: RecurrenceType.UNIQUE,
    recurringGroupId: null,
    recurringActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeReceivable(tenantId: string, overrides: Partial<Receivable> = {}): Receivable {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId,
    description: 'Recebível teste',
    expectedPaymentDate: '2026-03-05',
    actualPaymentDate: null,
    grossAmount: 2000,
    reserveAllocations: [],
    reserveAmount: 0,
    netAmount: 2000,
    status: ReceivableStatus.RECEIVED,
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

describe('BackupService — export/import backup', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('exports only the requesting tenant\'s data', async () => {
    await ctx.accountsRepo.create(makeAccount(TENANT_ID, { name: 'Minha Conta' }));
    await ctx.accountsRepo.create(makeAccount(OTHER_TENANT_ID, { name: 'Conta de outro tenant' }));

    const bundle = await ctx.service.exportBackup(TENANT_ID);

    expect(bundle.data.accounts).toHaveLength(1);
    expect(bundle.data.accounts[0].name).toBe('Minha Conta');
  });

  it('round-trips: export then import restores the same data for the tenant', async () => {
    await ctx.accountsRepo.create(makeAccount(TENANT_ID, { name: 'Conta A' }));
    await ctx.categoriesRepo.create(makeCategory(TENANT_ID, { name: 'Categoria A' }));
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID, { description: 'Pagamento A' }));

    const bundle = await ctx.service.exportBackup(TENANT_ID);

    // Simula perda de dados: outro serviço/repos vazios, depois restaura.
    const fresh = buildService();
    await fresh.service.importBackup(TENANT_ID, bundle);

    const restoredAccounts = await fresh.accountsRepo.findAll(TENANT_ID);
    const restoredCategories = await fresh.categoriesRepo.findAll(TENANT_ID);
    const restoredTransactions = await fresh.transactionsRepo.findAll(TENANT_ID);

    expect(restoredAccounts).toHaveLength(1);
    expect(restoredAccounts[0].name).toBe('Conta A');
    expect(restoredCategories[0].name).toBe('Categoria A');
    expect(restoredTransactions[0].description).toBe('Pagamento A');
  });

  it('import re-stamps every record with the importing tenant, ignoring the tenantId in the file', async () => {
    await ctx.accountsRepo.create(makeAccount(TENANT_ID));
    const bundle = await ctx.service.exportBackup(TENANT_ID);

    // Um bundle "malicioso"/desatualizado com tenantId de outro tenant.
    const tampered: BackupBundle = {
      ...bundle,
      data: {
        ...bundle.data,
        accounts: bundle.data.accounts.map((a) => ({ ...a, tenantId: 'attacker-tenant' })),
      },
    };

    await ctx.service.importBackup(OTHER_TENANT_ID, tampered);

    const otherTenantAccounts = await ctx.accountsRepo.findAll(OTHER_TENANT_ID);
    const attackerAccounts = await ctx.accountsRepo.findAll('attacker-tenant');
    expect(otherTenantAccounts).toHaveLength(1);
    expect(attackerAccounts).toHaveLength(0);
  });

  it('import does not touch other tenants\' data in the same store', async () => {
    await ctx.accountsRepo.create(makeAccount(OTHER_TENANT_ID, { name: 'Preservada' }));
    const bundle = await ctx.service.exportBackup(TENANT_ID); // empty for TENANT_ID

    await ctx.service.importBackup(TENANT_ID, bundle);

    const preserved = await ctx.accountsRepo.findAll(OTHER_TENANT_ID);
    expect(preserved).toHaveLength(1);
    expect(preserved[0].name).toBe('Preservada');
  });
});

describe('BackupService — account reset', () => {
  let ctx: ReturnType<typeof buildService>;

  const makeAccountType = (tenantId: string): AccountType => {
    const now = new Date().toISOString();
    return { id: randomUUID(), tenantId, name: 'Corrente', active: true, createdAt: now, updatedAt: now };
  };

  beforeEach(() => {
    ctx = buildService();
  });

  it('wipes all data and settings of the tenant', async () => {
    await ctx.accountsRepo.create(makeAccount(TENANT_ID));
    await ctx.accountTypesRepo.create(makeAccountType(TENANT_ID));
    await ctx.categoriesRepo.create(makeCategory(TENANT_ID));
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID));
    ctx.settingsRepo.items.push({ tenantId: TENANT_ID } as never);

    await ctx.service.resetTenant(TENANT_ID);

    expect(await ctx.accountsRepo.findAll(TENANT_ID)).toHaveLength(0);
    expect(await ctx.accountTypesRepo.findAll(TENANT_ID)).toHaveLength(0);
    expect(await ctx.categoriesRepo.findAll(TENANT_ID)).toHaveLength(0);
    expect(await ctx.transactionsRepo.findAll(TENANT_ID)).toHaveLength(0);
    expect(await ctx.settingsRepo.get(TENANT_ID)).toBeNull();
  });

  it('does not touch other tenants\' data', async () => {
    await ctx.accountsRepo.create(makeAccount(TENANT_ID));
    await ctx.accountsRepo.create(makeAccount(OTHER_TENANT_ID, { name: 'Preservada' }));
    ctx.settingsRepo.items.push({ tenantId: OTHER_TENANT_ID } as never);

    await ctx.service.resetTenant(TENANT_ID);

    const preserved = await ctx.accountsRepo.findAll(OTHER_TENANT_ID);
    expect(preserved).toHaveLength(1);
    expect(preserved[0].name).toBe('Preservada');
    expect(await ctx.settingsRepo.get(OTHER_TENANT_ID)).not.toBeNull();
  });
});

describe('BackupService — CSV export', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('includes a header row and one row per transaction/receivable in range', async () => {
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID, {
      description: 'Aluguel',
      amount: 150000,
      expectedDate: '2026-03-10',
    }));
    await ctx.receivablesRepo.create(makeReceivable(TENANT_ID, {
      description: 'Projeto X',
      netAmount: 500000,
      expectedPaymentDate: '2026-03-12',
    }));

    const csv = await ctx.service.exportTransactionsCsv(TENANT_ID, { all: true } as never);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Data;Tipo;Descrição;Categoria;Valor;Status');
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.includes('Aluguel') && l.includes('1500,00'))).toBe(true);
    expect(lines.some((l) => l.includes('Projeto X') && l.includes('5000,00'))).toBe(true);
  });

  it('excludes entries outside the requested date range', async () => {
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID, { description: 'Dentro', expectedDate: '2026-03-15' }));
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID, { description: 'Fora', expectedDate: '2026-04-01' }));

    const csv = await ctx.service.exportTransactionsCsv(TENANT_ID, { from: '2026-03-01', to: '2026-03-31' } as never);

    expect(csv).toContain('Dentro');
    expect(csv).not.toContain('Fora');
  });
});

describe('BackupService — bank statement parsing', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('parses a CSV with a recognizable header (PT-BR)', async () => {
    const csv = 'Data;Descrição;Valor\n01/03/2026;Salário;5000,00\n02/03/2026;Supermercado;-350,50';
    const entries = await ctx.service.parseStatement(TENANT_ID, 'extrato.csv', csv);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ date: '2026-03-01', description: 'Salário', amount: 500000, type: 'INCOME' });
    expect(entries[1]).toMatchObject({ date: '2026-03-02', description: 'Supermercado', amount: 35050, type: 'EXPENSE' });
  });

  it('parses a headerless CSV assuming date, description, amount order', async () => {
    const csv = '2026-03-05,Pix recebido,120.00';
    const entries = await ctx.service.parseStatement(TENANT_ID, 'extrato.csv', csv);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: '2026-03-05', description: 'Pix recebido', amount: 12000, type: 'INCOME' });
  });

  it('parses OFX 1.x STMTTRN blocks', async () => {
    const ofx = `
      <OFX>
      <BANKTRANLIST>
      <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20260310
      <TRNAMT>-89.90
      <NAME>Assinatura Streaming
      </STMTTRN>
      <STMTTRN>
      <TRNTYPE>CREDIT
      <DTPOSTED>20260312
      <TRNAMT>2500.00
      <MEMO>Transferência recebida
      </STMTTRN>
      </BANKTRANLIST>
      </OFX>
    `;
    const entries = await ctx.service.parseStatement(TENANT_ID, 'extrato.ofx', ofx);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ date: '2026-03-10', description: 'Assinatura Streaming', amount: 8990, type: 'EXPENSE' });
    expect(entries[1]).toMatchObject({ date: '2026-03-12', description: 'Transferência recebida', amount: 250000, type: 'INCOME' });
  });

  it('flags an entry as a possible duplicate when a matching transaction already exists', async () => {
    await ctx.transactionsRepo.create(makeTransaction(TENANT_ID, {
      description: 'Salário',
      amount: 500000,
      expectedDate: '2026-03-01',
    }));

    const csv = 'Data;Descrição;Valor\n01/03/2026;Salário;5000,00';
    const entries = await ctx.service.parseStatement(TENANT_ID, 'extrato.csv', csv);

    expect(entries[0].possibleDuplicate).toBe(true);
  });
});
