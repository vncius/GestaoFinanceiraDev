import { describe, expect, it } from 'vitest';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { AccountTypesService } from '../account-types/account-types.service';
import { AccountTypesRepository } from '../account-types/account-types.repository';
import { AccountType } from '../account-types/account-types.types';
import { AccountsService } from '../accounts/accounts.service';
import { AccountsRepository } from '../accounts/accounts.repository';
import { Account } from '../accounts/accounts.types';
import { CategoriesService } from '../categories/categories.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';
import { SettingsService } from '../settings/settings.service';
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

class FakeAccountTypesRepo extends InMemoryRepo<AccountType> implements AccountTypesRepository {
  async findActive(tenantId: string) {
    return this.items.filter((t) => t.tenantId === tenantId && t.active);
  }
}

class FakeAccountsRepo extends InMemoryRepo<Account> implements AccountsRepository {
  async findActive(tenantId: string) {
    return this.items.filter((a) => a.tenantId === tenantId && a.active);
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

class FakeSettingsRepo implements SettingsRepository {
  items: FinancialSettings[] = [];

  async get(tenantId: string) {
    return this.items.find((s) => s.tenantId === tenantId) ?? null;
  }

  async upsert(data: FinancialSettings) {
    const index = this.items.findIndex((s) => s.tenantId === data.tenantId);
    if (index === -1) {
      this.items.push(data);
    } else {
      this.items[index] = data;
    }
    return data;
  }

  async deleteAll(tenantId: string) {
    this.items = this.items.filter((s) => s.tenantId !== tenantId);
  }
}

function buildService() {
  const accountTypesRepo = new FakeAccountTypesRepo();
  const accountsRepo = new FakeAccountsRepo();
  const categoriesRepo = new FakeCategoriesRepo();
  const settingsRepo = new FakeSettingsRepo();

  const accountTypesService = new AccountTypesService(accountTypesRepo);
  const accountsService = new AccountsService(accountsRepo);
  const categoriesService = new CategoriesService(categoriesRepo);
  const settingsService = new SettingsService(settingsRepo);

  const bootstrap = new TenantBootstrapService(
    accountTypesService,
    accountsService,
    categoriesService,
  );

  return { bootstrap, accountTypesService, accountsService, categoriesService, settingsService };
}

describe('TenantBootstrapService', () => {
  it('cria tipos de conta, conta principal e categorias para um tenant vazio', async () => {
    const { bootstrap, accountTypesService, accountsService, categoriesService } = buildService();

    await bootstrap.seedDefaults(TENANT_ID);

    const types = await accountTypesService.findAll(TENANT_ID);
    expect(types.map((t) => t.name)).toEqual(['Conta Principal', 'Reserva de Emergência']);

    const accounts = await accountsService.findAll(TENANT_ID);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('Conta Principal');
    expect(accounts[0].accountTypeId).toBe(types[0].id);

    const categories = await categoriesService.findAll(TENANT_ID);
    expect(categories.some((c) => c.name === 'Salário' && c.type === CategoryType.INCOME)).toBe(true);
    expect(categories.some((c) => c.name === 'Assinaturas' && c.type === CategoryType.EXPENSE)).toBe(true);
    expect(categories.some((c) => c.name === 'Nota fiscal')).toBe(false);
    expect(categories.some((c) => c.name === 'Sophia')).toBe(false);
  });

  it('não duplica dados quando o tenant já possui tipos, conta ou categorias', async () => {
    const { bootstrap, accountTypesService, accountsService, categoriesService } = buildService();

    await accountTypesService.create(TENANT_ID, { name: 'Tipo Existente' });
    await accountsService.create(TENANT_ID, {
      name: 'Conta Existente',
      initialBalance: 0,
      autoReserveEnabled: false,
      autoReservePercentage: 0,
    });
    await categoriesService.create(TENANT_ID, { name: 'Categoria Existente', type: CategoryType.EXPENSE });

    await bootstrap.seedDefaults(TENANT_ID);

    expect(await accountTypesService.findAll(TENANT_ID)).toHaveLength(1);
    expect(await accountsService.findAll(TENANT_ID)).toHaveLength(1);
    expect(await categoriesService.findAll(TENANT_ID)).toHaveLength(1);
  });

  it('é idempotente ao ser chamado duas vezes seguidas', async () => {
    const { bootstrap, accountTypesService, accountsService, categoriesService } = buildService();

    await bootstrap.seedDefaults(TENANT_ID);
    await bootstrap.seedDefaults(TENANT_ID);

    expect(await accountTypesService.findAll(TENANT_ID)).toHaveLength(2);
    expect(await accountsService.findAll(TENANT_ID)).toHaveLength(1);
    expect(await categoriesService.findAll(TENANT_ID)).toHaveLength(20);
  });
});
