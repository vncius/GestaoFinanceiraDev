import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransfersService } from './transfers.service';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { Account } from '../accounts/accounts.types';
import { calcAccountBalance } from '../../shared/utils/balance.utils';

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
  async findByTransferGroup(tenantId: string, transferGroupId: string) {
    return this.items.filter((t) => t.tenantId === tenantId && t.transferGroupId === transferGroupId);
  }
}

class FakeAccountsRepo extends InMemoryRepo<Account> implements AccountsRepository {
  async findActive(tenantId: string) {
    return this.items.filter((a) => a.tenantId === tenantId && a.active);
  }
}

function buildService() {
  const transactionsRepo = new FakeTransactionsRepo();
  const accountsRepo = new FakeAccountsRepo();
  const service = new TransfersService(transactionsRepo, accountsRepo);
  return { service, transactionsRepo, accountsRepo };
}

async function seedAccount(accountsRepo: FakeAccountsRepo, overrides: Partial<Account> = {}): Promise<Account> {
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
  return accountsRepo.create(account);
}

describe('TransfersService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('createTransfer gera duas transações TRANSFER ligadas pelo mesmo transferGroupId, já efetivadas', async () => {
    const { service, accountsRepo } = ctx;
    const pj = await seedAccount(accountsRepo, { name: 'PJ' });
    const principal = await seedAccount(accountsRepo, { name: 'Principal' });

    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: pj.id,
      targetAccountId: principal.id,
      amount: 700000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse mensal',
    });

    expect(pair.outgoing.type).toBe(TransactionType.TRANSFER);
    expect(pair.incoming.type).toBe(TransactionType.TRANSFER);
    expect(pair.outgoing.transferGroupId).toBe(pair.transferGroupId);
    expect(pair.incoming.transferGroupId).toBe(pair.transferGroupId);
    expect(pair.outgoing.sourceAccountId).toBe(pj.id);
    expect(pair.outgoing.targetAccountId).toBeNull();
    expect(pair.outgoing.status).toBe(TransactionStatus.PAID);
    expect(pair.incoming.sourceAccountId).toBeNull();
    expect(pair.incoming.targetAccountId).toBe(principal.id);
    expect(pair.incoming.status).toBe(TransactionStatus.RECEIVED);
    expect(pair.outgoing.originType).toBe(OriginType.TRANSFER);
  });

  it('saldos das duas contas batem corretamente após a transferência', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const pj = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 1000000 });
    const principal = await seedAccount(accountsRepo, { name: 'Principal', initialBalance: 0 });

    await service.createTransfer(TENANT_ID, {
      sourceAccountId: pj.id,
      targetAccountId: principal.id,
      amount: 700000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse mensal',
    });

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(pj, all)).toBe(300000);
    expect(calcAccountBalance(principal, all)).toBe(700000);
  });

  it('recusa transferência para a mesma conta', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);
    await expect(
      service.createTransfer(TENANT_ID, {
        sourceAccountId: account.id,
        targetAccountId: account.id,
        amount: 1000,
        date: '2026-08-10T00:00:00.000Z',
        description: 'Inválida',
      }),
    ).rejects.toMatchObject({ code: 'transfer.sameAccount' });
  });

  it('recusa transferência com conta de destino inativa', async () => {
    const { service, accountsRepo } = ctx;
    const source = await seedAccount(accountsRepo);
    const target = await seedAccount(accountsRepo, { active: false });
    await expect(
      service.createTransfer(TENANT_ID, {
        sourceAccountId: source.id,
        targetAccountId: target.id,
        amount: 1000,
        date: '2026-08-10T00:00:00.000Z',
        description: 'Inválida',
      }),
    ).rejects.toMatchObject({ code: 'transfer.targetAccountNotFound' });
  });

  it('updateTransfer altera valor e descrição nas duas pernas', async () => {
    const { service, accountsRepo } = ctx;
    const source = await seedAccount(accountsRepo);
    const target = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: source.id,
      targetAccountId: target.id,
      amount: 1000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Original',
    });

    const updated = await service.updateTransfer(pair.transferGroupId, TENANT_ID, {
      amount: 2000,
      description: 'Corrigida',
    });

    expect(updated.outgoing.amount).toBe(2000);
    expect(updated.incoming.amount).toBe(2000);
    expect(updated.outgoing.description).toBe('Corrigida');
    expect(updated.incoming.description).toBe('Corrigida');
  });

  it('deleteTransfer recusa excluir uma transferência já efetivada sem reverter antes', async () => {
    const { service, accountsRepo } = ctx;
    const source = await seedAccount(accountsRepo);
    const target = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: source.id,
      targetAccountId: target.id,
      amount: 1000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    await expect(service.deleteTransfer(pair.transferGroupId, TENANT_ID)).rejects.toMatchObject({
      code: 'transfer.settledCannotDelete',
    });
  });

  it('revertTransfer volta as duas pernas para PENDING e então deleteTransfer as cancela', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const source = await seedAccount(accountsRepo);
    const target = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: source.id,
      targetAccountId: target.id,
      amount: 1000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    const reverted = await service.revertTransfer(pair.transferGroupId, TENANT_ID);
    expect(reverted.outgoing.status).toBe(TransactionStatus.PENDING);
    expect(reverted.incoming.status).toBe(TransactionStatus.PENDING);
    expect(reverted.outgoing.actualDate).toBeNull();

    await service.deleteTransfer(pair.transferGroupId, TENANT_ID);
    const legs = await transactionsRepo.findByTransferGroup(TENANT_ID, pair.transferGroupId);
    expect(legs.every((l) => l.status === TransactionStatus.CANCELED)).toBe(true);
  });

  it('revertTransfer recusa reverter uma transferência que não está efetivada', async () => {
    const { service, accountsRepo } = ctx;
    const source = await seedAccount(accountsRepo);
    const target = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: source.id,
      targetAccountId: target.id,
      amount: 1000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });
    await service.revertTransfer(pair.transferGroupId, TENANT_ID);

    await expect(service.revertTransfer(pair.transferGroupId, TENANT_ID)).rejects.toMatchObject({
      code: 'transfer.notSettledCannotRevert',
    });
  });
});

// Datas relativas a hoje: uma data fixa no futuro viraria passado com o
// tempo e o teste passaria a exercitar o caminho errado.
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`;
}

describe('TransfersService — transferências programadas', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('transferência com data futura nasce prevista nas duas pernas e não mexe nos saldos', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo, { name: 'Principal' });

    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: isoDaysFromToday(15),
      description: 'Repasse programado',
    });

    expect(pair.outgoing.status).toBe(TransactionStatus.PENDING);
    expect(pair.incoming.status).toBe(TransactionStatus.PENDING);
    expect(pair.outgoing.actualDate).toBeNull();
    expect(pair.incoming.actualDate).toBeNull();

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(origem, all)).toBe(1000000);
    expect(calcAccountBalance(destino, all)).toBe(0);
  });

  it('transferência com a data de hoje continua nascendo efetivada', async () => {
    const { service, accountsRepo } = ctx;
    const origem = await seedAccount(accountsRepo);
    const destino = await seedAccount(accountsRepo);

    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 1000,
      date: isoDaysFromToday(0),
      description: 'Hoje',
    });

    expect(pair.outgoing.status).toBe(TransactionStatus.PAID);
    expect(pair.incoming.status).toBe(TransactionStatus.RECEIVED);
  });

  it('settleTransfer efetiva as duas pernas e move o saldo das duas contas de uma vez', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo, { initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: isoDaysFromToday(15),
      description: 'Repasse programado',
    });

    const settled = await service.settleTransfer(pair.transferGroupId, TENANT_ID);

    expect(settled.outgoing.status).toBe(TransactionStatus.PAID);
    expect(settled.incoming.status).toBe(TransactionStatus.RECEIVED);
    expect(settled.outgoing.actualDate).not.toBeNull();
    expect(settled.incoming.actualDate).not.toBeNull();

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(origem, all)).toBe(750000);
    expect(calcAccountBalance(destino, all)).toBe(250000);
  });

  it('settleTransfer recusa uma transferência que já está efetivada', async () => {
    const { service, accountsRepo } = ctx;
    const origem = await seedAccount(accountsRepo);
    const destino = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 1000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    await expect(service.settleTransfer(pair.transferGroupId, TENANT_ID)).rejects.toMatchObject({
      code: 'transfer.alreadySettled',
    });
  });

  it('reverter e efetivar de novo devolve os saldos ao estado original nas duas contas', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo, { initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    await service.revertTransfer(pair.transferGroupId, TENANT_ID);
    let all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(origem, all)).toBe(1000000);
    expect(calcAccountBalance(destino, all)).toBe(0);

    await service.settleTransfer(pair.transferGroupId, TENANT_ID);
    all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(origem, all)).toBe(750000);
    expect(calcAccountBalance(destino, all)).toBe(250000);
  });

  it('mover a data de uma transferência efetivada para o futuro a devolve para prevista', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo, { initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    const updated = await service.updateTransfer(pair.transferGroupId, TENANT_ID, {
      date: isoDaysFromToday(20),
    });

    expect(updated.outgoing.status).toBe(TransactionStatus.PENDING);
    expect(updated.incoming.status).toBe(TransactionStatus.PENDING);
    expect(updated.outgoing.actualDate).toBeNull();

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(calcAccountBalance(origem, all)).toBe(1000000);
    expect(calcAccountBalance(destino, all)).toBe(0);
  });

  it('excluir uma transferência prevista cancela as duas pernas (origem e destino)', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo, { initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo);
    const pair = await service.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: isoDaysFromToday(15),
      description: 'Repasse programado',
    });

    await service.deleteTransfer(pair.transferGroupId, TENANT_ID);

    const legs = await transactionsRepo.findByTransferGroup(TENANT_ID, pair.transferGroupId);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.status === TransactionStatus.CANCELED)).toBe(true);
  });
});

describe('TransfersService — reserva automática excluída', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('cascadeCancelForOrigin cancela as duas pernas da reserva ligada à entrada', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo);
    const destino = await seedAccount(accountsRepo);
    const originId = randomUUID();
    const pair = await service.createAutoReserveTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 30000,
      date: '2026-08-05T00:00:00.000Z',
      description: 'Reserva automática',
      originId,
    });

    await service.cascadeCancelForOrigin(TENANT_ID, originId);

    const legs = await transactionsRepo.findByTransferGroup(TENANT_ID, pair.transferGroupId);
    expect(legs.every((l) => l.status === TransactionStatus.CANCELED)).toBe(true);
  });

  it('resettleByOrigin cria um par novo em vez de ressuscitar o par cancelado', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const origem = await seedAccount(accountsRepo);
    const destino = await seedAccount(accountsRepo);
    const originId = randomUUID();
    const first = await service.createAutoReserveTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 30000,
      date: '2026-08-05T00:00:00.000Z',
      description: 'Reserva automática',
      originId,
    });
    await service.cascadeCancelForOrigin(TENANT_ID, originId);

    const second = await service.resettleByOrigin(TENANT_ID, originId, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 30000,
      date: '2026-08-05T00:00:00.000Z',
      description: 'Reserva automática',
    });

    expect(second.transferGroupId).not.toBe(first.transferGroupId);
    const canceled = await transactionsRepo.findByTransferGroup(TENANT_ID, first.transferGroupId);
    expect(canceled.every((l) => l.status === TransactionStatus.CANCELED)).toBe(true);
    const revived = await transactionsRepo.findByTransferGroup(TENANT_ID, second.transferGroupId);
    expect(revived).toHaveLength(2);
  });
});
