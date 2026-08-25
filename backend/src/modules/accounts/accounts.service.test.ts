import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';
import { Account } from './accounts.types';
import { createAccountSchema, updateAccountSchema } from './accounts.schemas';

const TENANT_ID = 'test-tenant-1';

class FakeAccountsRepo implements AccountsRepository {
  items: Account[] = [];

  async findAll(tenantId: string): Promise<Account[]> {
    return this.items.filter((i) => i.tenantId === tenantId);
  }

  async findActive(tenantId: string): Promise<Account[]> {
    return this.items.filter((i) => i.tenantId === tenantId && i.active);
  }

  async findById(id: string, tenantId: string): Promise<Account | null> {
    return this.items.find((i) => i.id === id && i.tenantId === tenantId) ?? null;
  }

  async create(data: Account): Promise<Account> {
    this.items.push(data);
    return data;
  }

  async update(id: string, data: Partial<Account>, tenantId: string): Promise<Account> {
    const index = this.items.findIndex((i) => i.id === id && i.tenantId === tenantId);
    if (index === -1) throw new Error(`not found: ${id}`);
    this.items[index] = { ...this.items[index], ...data };
    return this.items[index];
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.items = this.items.filter((i) => !(i.id === id && i.tenantId === tenantId));
  }

  async replaceAll(tenantId: string, items: Account[]): Promise<void> {
    const others = this.items.filter((i) => i.tenantId !== tenantId);
    this.items = [...others, ...items];
  }
}

function buildService() {
  const repo = new FakeAccountsRepo();
  const service = new AccountsService(repo);
  return { service, repo };
}

async function seedAccount(repo: FakeAccountsRepo, overrides: Partial<Account> = {}): Promise<Account> {
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    name: 'Conta',
    accountTypeId: null,
    initialBalance: 0,
    initialBalanceDate: now,
    active: true,
    autoReserveEnabled: false,
    autoReservePercentage: 0,
    autoReserveTargetAccountId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return repo.create(account);
}

describe('AccountsService — Reserva automática (E8)', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('create é permissivo: aceita autoReserveEnabled sem target (regra fica inerte, sem validar)', async () => {
    const { service } = ctx;
    const input = createAccountSchema.parse({ name: 'PJ', autoReserveEnabled: true, autoReservePercentage: 30 });
    const account = await service.create(TENANT_ID, input);
    expect(account.autoReserveEnabled).toBe(true);
    expect(account.autoReserveTargetAccountId).toBeNull();
  });

  it('update recusa ativar a regra sem informar conta de destino', async () => {
    const { service, repo } = ctx;
    const account = await seedAccount(repo);
    const input = updateAccountSchema.parse({ autoReserveEnabled: true, autoReservePercentage: 30 });
    await expect(service.update(account.id, input, TENANT_ID)).rejects.toMatchObject({
      code: 'account.autoReserveTargetRequired',
    });
  });

  it('update recusa origem igual ao destino', async () => {
    const { service, repo } = ctx;
    const account = await seedAccount(repo);
    const input = updateAccountSchema.parse({
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: account.id,
    });
    await expect(service.update(account.id, input, TENANT_ID)).rejects.toMatchObject({
      code: 'account.autoReserveSameAccount',
    });
  });

  it('update recusa destino inexistente ou inativo', async () => {
    const { service, repo } = ctx;
    const account = await seedAccount(repo);
    const inactiveTarget = await seedAccount(repo, { active: false });

    const missingTargetInput = updateAccountSchema.parse({
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: randomUUID(),
    });
    await expect(service.update(account.id, missingTargetInput, TENANT_ID)).rejects.toMatchObject({
      code: 'account.autoReserveTargetNotFound',
    });

    const inactiveTargetInput = updateAccountSchema.parse({
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: inactiveTarget.id,
    });
    await expect(service.update(account.id, inactiveTargetInput, TENANT_ID)).rejects.toMatchObject({
      code: 'account.autoReserveTargetNotFound',
    });
  });

  it('update aceita uma regra completa e válida', async () => {
    const { service, repo } = ctx;
    const target = await seedAccount(repo, { name: 'Investimentos' });
    const source = await seedAccount(repo, { name: 'PJ' });

    const input = updateAccountSchema.parse({
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: target.id,
    });
    const updated = await service.update(source.id, input, TENANT_ID);
    expect(updated.autoReserveEnabled).toBe(true);
    expect(updated.autoReserveTargetAccountId).toBe(target.id);
  });

  it('update não valida destino ao desativar a regra', async () => {
    const { service, repo } = ctx;
    const account = await seedAccount(repo, { autoReserveEnabled: false });
    const input = updateAccountSchema.parse({ autoReserveEnabled: false });
    const updated = await service.update(account.id, input, TENANT_ID);
    expect(updated.autoReserveEnabled).toBe(false);
  });
});
