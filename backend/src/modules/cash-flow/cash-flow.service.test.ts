import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CashFlowService } from './cash-flow.service';
import { TransfersService } from '../transfers/transfers.service';
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
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';

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

  const service = new CashFlowService(transactionsRepo, accountsRepo);

  return { service, transactionsRepo, accountsRepo };
}

// Com TransfersService injetado, para exercitar a reserva automática (E8) —
// os demais testes usam buildService() sem ele de propósito, para confirmar
// que a ausência (não injetado em todo contexto) não quebra nada.
function buildServiceWithTransfers() {
  const transactionsRepo = new FakeTransactionsRepo();
  const accountsRepo = new FakeAccountsRepo();
  const transfersService = new TransfersService(transactionsRepo, accountsRepo);
  const service = new CashFlowService(transactionsRepo, accountsRepo, undefined, undefined, transfersService);

  return { service, transactionsRepo, accountsRepo, transfersService };
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
    autoReserveTargetAccountId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  return accountsRepo.create(account);
}

describe('CashFlowService — Income', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('createIncome cria uma transação INCOME pendente com a conta informada', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const tx = await service.createIncome(TENANT_ID, account.id, {
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

  it('createIncome usa a conta do contexto quando targetAccountId não é informado', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const tx = await service.createIncome(TENANT_ID, account.id, {
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

    const created = await service.createIncome(TENANT_ID, account.id, {
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

    const created = await service.createIncome(TENANT_ID, account.id, {
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

    const created = await service.createIncome(TENANT_ID, account.id, {
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

    await service.createIncome(TENANT_ID, account.id, {
      description: 'Salário fixo',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-06-05T00:00:00.000Z',
      targetAccountId: account.id,
      recurrence: RecurrenceType.FIXED,
    });

    await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: account.id });

    const { transactionsRepo } = ctx;
    const allIncome = (await transactionsRepo.findAll(TENANT_ID)).filter((t) => t.type === TransactionType.INCOME);
    const august = allIncome.find((t) => t.expectedDate.startsWith('2026-08'));
    expect(august).toBeDefined();
    expect(august?.status).toBe(TransactionStatus.PENDING);
    expect(august?.amount).toBe(500000);
  });
});

describe('CashFlowService — Conta como contexto financeiro (E5)', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('getCashFlow retorna conjuntos disjuntos de lançamentos e saldos independentes para contas diferentes', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const accountA = await seedAccount(accountsRepo, { name: 'Conta A', initialBalance: 100000 });
    const accountB = await seedAccount(accountsRepo, { name: 'Conta B', initialBalance: 500000 });

    await service.createIncome(TENANT_ID, accountA.id, {
      description: 'Entrada A',
      categoryId: randomUUID(),
      amount: 50000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: accountA.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.createIncome(TENANT_ID, accountB.id, {
      description: 'Entrada B',
      categoryId: randomUUID(),
      amount: 70000,
      expectedDate: '2026-08-06T00:00:00.000Z',
      targetAccountId: accountB.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.createPayment(TENANT_ID, accountA.id, {
      description: 'Pagamento A',
      categoryId: randomUUID(),
      amount: 20000,
      expectedDate: '2026-08-07T00:00:00.000Z',
      sourceAccountId: accountA.id,
      recurrence: RecurrenceType.UNIQUE,
    });

    const flowA = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: accountA.id });
    const flowB = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: accountB.id });

    expect(flowA.entries.map((e) => e.description)).toEqual(['Entrada A']);
    expect(flowA.payments.map((p) => p.description)).toEqual(['Pagamento A']);
    expect(flowB.entries.map((e) => e.description)).toEqual(['Entrada B']);
    expect(flowB.payments).toHaveLength(0);

    expect(flowA.summary.initialBalance).toBe(100000);
    expect(flowB.summary.initialBalance).toBe(500000);

    // Saldos independentes: nenhum lançamento de uma conta vaza pro resumo da outra.
    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(all).toHaveLength(3);
  });

  it('createTransaction (pagamento) usa a conta do contexto como sourceAccountId quando não informado', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);

    const tx = await service.createPayment(TENANT_ID, account.id, {
      description: 'Aluguel',
      categoryId: randomUUID(),
      amount: 150000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      recurrence: RecurrenceType.UNIQUE,
    });

    expect(tx.sourceAccountId).toBe(account.id);
  });

  it('getCashFlow lança erro quando a conta não existe', async () => {
    const { service } = ctx;
    await expect(
      service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'account.notFound' });
  });
});

describe('CashFlowService — Reserva automática como transferência (E8)', () => {
  let ctx: ReturnType<typeof buildServiceWithTransfers>;

  beforeEach(() => {
    ctx = buildServiceWithTransfers();
  });

  it('receiveIncome numa conta com regra ativa gera automaticamente a transferência de reserva', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos' });
    const pj = await seedAccount(accountsRepo, {
      name: 'PJ',
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: investimentos.id,
    });

    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    const legs = await transactionsRepo.findByOrigin(TENANT_ID, OriginType.AUTO_RESERVE, income.id);
    expect(legs).toHaveLength(2);
    const outgoing = legs.find((l) => l.sourceAccountId !== null)!;
    const incoming = legs.find((l) => l.targetAccountId !== null)!;
    expect(outgoing.sourceAccountId).toBe(pj.id);
    expect(outgoing.amount).toBe(300000);
    expect(outgoing.status).toBe(TransactionStatus.PAID);
    expect(incoming.targetAccountId).toBe(investimentos.id);
    expect(incoming.amount).toBe(300000);
    expect(incoming.status).toBe(TransactionStatus.RECEIVED);
    expect(outgoing.transferGroupId).toBe(incoming.transferGroupId);
  });

  it('revertIncome reverte a transferência automática em cascata', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos' });
    const pj = await seedAccount(accountsRepo, {
      name: 'PJ',
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: investimentos.id,
    });
    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    await service.revertIncome(income.id, TENANT_ID);

    const legs = await transactionsRepo.findByOrigin(TENANT_ID, OriginType.AUTO_RESERVE, income.id);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.status === TransactionStatus.PENDING)).toBe(true);
    expect(legs.every((l) => l.actualDate === null)).toBe(true);
  });

  it('receber de novo após reverter reconfirma o mesmo par em vez de duplicar', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos' });
    const pj = await seedAccount(accountsRepo, {
      name: 'PJ',
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: investimentos.id,
    });
    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);
    await service.revertIncome(income.id, TENANT_ID);
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    const legs = await transactionsRepo.findByOrigin(TENANT_ID, OriginType.AUTO_RESERVE, income.id);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.status === TransactionStatus.PAID || l.status === TransactionStatus.RECEIVED)).toBe(true);
  });

  it('conta sem regra de reserva configurada não gera nenhuma transferência automática', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const conta = await seedAccount(accountsRepo);
    const income = await service.createIncome(TENANT_ID, conta.id, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: conta.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(all.filter((t) => t.type === TransactionType.TRANSFER)).toHaveLength(0);
  });
});

describe('CashFlowService — transferências no fluxo das duas contas', () => {
  let ctx: ReturnType<typeof buildServiceWithTransfers>;

  beforeEach(() => {
    ctx = buildServiceWithTransfers();
  });

  // Data relativa a hoje: uma data fixa no futuro viraria passado com o tempo.
  function futureDate(days: number): { iso: string; month: number; year: number } {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };
  }

  it('transferência programada entra como entrada prevista no fluxo da conta de destino', async () => {
    const { service, accountsRepo, transfersService } = ctx;
    const origem = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo, { name: 'Principal' });
    const when = futureDate(20);

    await transfersService.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: when.iso,
      description: 'Repasse programado',
    });

    const flow = await service.getCashFlow(TENANT_ID, {
      month: when.month,
      year: when.year,
      accountId: destino.id,
    });

    expect(flow.transfers).toHaveLength(1);
    expect(flow.transfers[0].direction).toBe('IN');
    expect(flow.transfers[0].status).toBe(TransactionStatus.PENDING);
    expect(flow.transfers[0].counterpartAccountId).toBe(origem.id);
    expect(flow.summary.expectedTransferInflow).toBe(250000);
    expect(flow.summary.transferInflow).toBe(0);
    expect(flow.summary.realizedBalance).toBe(0);
    expect(flow.summary.projectedBalance).toBe(250000);
  });

  it('efetivar a transferência programada a move de prevista para efetiva nas duas contas', async () => {
    const { service, accountsRepo, transfersService } = ctx;
    const origem = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo, { name: 'Principal' });
    const when = futureDate(20);

    const pair = await transfersService.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: when.iso,
      description: 'Repasse programado',
    });
    await transfersService.settleTransfer(pair.transferGroupId, TENANT_ID);

    const destinoFlow = await service.getCashFlow(TENANT_ID, {
      month: when.month,
      year: when.year,
      accountId: destino.id,
    });
    expect(destinoFlow.summary.transferInflow).toBe(250000);
    expect(destinoFlow.summary.expectedTransferInflow).toBe(0);
    expect(destinoFlow.summary.realizedBalance).toBe(250000);

    const origemFlow = await service.getCashFlow(TENANT_ID, {
      month: when.month,
      year: when.year,
      accountId: origem.id,
    });
    expect(origemFlow.summary.transferOutflow).toBe(250000);
    expect(origemFlow.summary.expectedTransferOutflow).toBe(0);
    expect(origemFlow.summary.realizedBalance).toBe(750000);
  });

  it('excluir a transferência limpa o lançamento e o saldo nas duas contas', async () => {
    const { service, accountsRepo, transfersService } = ctx;
    const origem = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 1000000 });
    const destino = await seedAccount(accountsRepo, { name: 'Principal' });

    const pair = await transfersService.createTransfer(TENANT_ID, {
      sourceAccountId: origem.id,
      targetAccountId: destino.id,
      amount: 250000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });
    // Protocolo da tela: reverter antes de excluir quando já efetivada.
    await transfersService.revertTransfer(pair.transferGroupId, TENANT_ID);
    await transfersService.deleteTransfer(pair.transferGroupId, TENANT_ID);

    const destinoFlow = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: destino.id });
    expect(destinoFlow.transfers).toHaveLength(0);
    expect(destinoFlow.summary.transferInflow).toBe(0);
    expect(destinoFlow.summary.expectedTransferInflow).toBe(0);

    const origemFlow = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: origem.id });
    expect(origemFlow.transfers).toHaveLength(0);
    expect(origemFlow.summary.transferOutflow).toBe(0);
    expect(origemFlow.summary.expectedTransferOutflow).toBe(0);
    expect(origemFlow.summary.realizedBalance).toBe(1000000);
  });
});

describe('CashFlowService — bordas da reserva automática', () => {
  let ctx: ReturnType<typeof buildServiceWithTransfers>;

  beforeEach(() => {
    ctx = buildServiceWithTransfers();
  });

  async function seedPjComReserva(accountsRepo: FakeAccountsRepo, destino: Account) {
    return seedAccount(accountsRepo, {
      name: 'PJ',
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      autoReserveTargetAccountId: destino.id,
    });
  }

  it('excluir a entrada cancela em cascata as pernas da reserva automática', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos' });
    const pj = await seedPjComReserva(accountsRepo, investimentos);

    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);
    // Mesmo protocolo da tela: reverter antes de excluir.
    await service.revertIncome(income.id, TENANT_ID);
    await service.deleteIncome(income.id, TENANT_ID);

    const legs = await transactionsRepo.findByOrigin(TENANT_ID, OriginType.AUTO_RESERVE, income.id);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.status === TransactionStatus.CANCELED)).toBe(true);

    const flow = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: investimentos.id });
    expect(flow.transfers).toHaveLength(0);
    expect(flow.summary.expectedTransferInflow).toBe(0);
  });

  it('regra apontando para uma conta inativa fica inerte em vez de sumir com o valor', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos', active: false });
    const pj = await seedPjComReserva(accountsRepo, investimentos);

    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    const all = await transactionsRepo.findAll(TENANT_ID);
    expect(all.filter((t) => t.type === TransactionType.TRANSFER)).toHaveLength(0);
  });

  it('a reserva fica no mês da entrada, não no mês em que a baixa foi dada', async () => {
    const { service, accountsRepo, transactionsRepo } = ctx;
    const investimentos = await seedAccount(accountsRepo, { name: 'Investimentos' });
    const pj = await seedPjComReserva(accountsRepo, investimentos);

    const income = await service.createIncome(TENANT_ID, pj.id, {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 1000000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: pj.id,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, undefined);

    const legs = await transactionsRepo.findByOrigin(TENANT_ID, OriginType.AUTO_RESERVE, income.id);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.expectedDate.slice(0, 7) === '2026-08')).toBe(true);

    const flow = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: investimentos.id });
    expect(flow.transfers).toHaveLength(1);
    expect(flow.summary.transferInflow).toBe(300000);
  });
});

describe('CashFlowService — retrato compartilhado entre contas (dashboard)', () => {
  let ctx: ReturnType<typeof buildServiceWithTransfers>;

  beforeEach(() => {
    ctx = buildServiceWithTransfers();
  });

  // Conta quantas varreduras completas de transações uma operação dispara.
  function countReads(repo: FakeTransactionsRepo): () => number {
    let reads = 0;
    const original = repo.findAll.bind(repo);
    repo.findAll = async (tenantId: string) => {
      reads += 1;
      return original(tenantId);
    };
    return () => reads;
  }

  async function seedAccounts(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const account = await seedAccount(ctx.accountsRepo, { name: `Conta ${i}`, initialBalance: 1000 * i });
      ids.push(account.id);
    }
    return ids;
  }

  it('getCashFlowMany devolve exatamente os mesmos resumos das chamadas individuais', async () => {
    const { service, transfersService } = ctx;
    const ids = await seedAccounts(3);
    await service.createIncome(TENANT_ID, ids[0], {
      description: 'Projeto X',
      categoryId: randomUUID(),
      amount: 500000,
      expectedDate: '2026-08-05T00:00:00.000Z',
      targetAccountId: ids[0],
      recurrence: RecurrenceType.UNIQUE,
    });
    await transfersService.createTransfer(TENANT_ID, {
      sourceAccountId: ids[0],
      targetAccountId: ids[1],
      amount: 120000,
      date: '2026-08-10T00:00:00.000Z',
      description: 'Repasse',
    });

    const many = await service.getCashFlowMany(TENANT_ID, 8, 2026, ids);
    const individual = [];
    for (const accountId of ids) {
      individual.push(await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId }));
    }

    expect(many.map((f) => f.summary)).toEqual(individual.map((f) => f.summary));
    expect(many.map((f) => f.transfers)).toEqual(individual.map((f) => f.transfers));
  });

  it('getCashFlowMany não relê as transações a cada conta', async () => {
    const { service, transactionsRepo } = ctx;
    const few = await seedAccounts(2);
    const reads = countReads(transactionsRepo);

    await service.getCashFlowMany(TENANT_ID, 8, 2026, few);
    const afterFew = reads();

    const many = [...few, ...(await seedAccounts(6))];
    await service.getCashFlowMany(TENANT_ID, 8, 2026, many);
    const afterMany = reads() - afterFew;

    // Custo constante: 8 contas custam o mesmo que 2.
    expect(afterMany).toBe(afterFew);
  });

  it('getCashFlow ainda funciona sozinho, lendo os próprios dados', async () => {
    const { service } = ctx;
    const [accountId] = await seedAccounts(1);

    const flow = await service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId });

    expect(flow.month).toBe(8);
    expect(flow.year).toBe(2026);
  });

  it('getCashFlow com uma conta inexistente no retrato continua devolvendo account.notFound', async () => {
    const { service } = ctx;
    await seedAccounts(1);

    await expect(
      service.getCashFlow(TENANT_ID, { month: 8, year: 2026, accountId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'account.notFound' });
  });

  it('loadDataset materializa a recorrência fixa antes de tirar o retrato', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo);
    await service.createPayment(TENANT_ID, account.id, {
      description: 'Aluguel',
      categoryId: randomUUID(),
      amount: 150000,
      expectedDate: '2026-08-10T00:00:00.000Z',
      sourceAccountId: account.id,
      recurrence: RecurrenceType.FIXED,
    });

    const dataset = await service.loadDataset(TENANT_ID, 10, 2026);

    // Agosto (original), setembro e outubro (materializados na leitura).
    const alugueis = dataset.transactions.filter((t) => t.description === 'Aluguel');
    expect(alugueis.length).toBe(3);
  });
});

describe('CashFlowService — resumo: pendentes do mês e base da projeção', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  // Datas relativas a hoje: "previsto" depende de o mês ser atual ou futuro.
  function dayOfMonthOffset(monthOffset: number): { iso: string; month: number; year: number } {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-10T12:00:00.000Z`,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };
  }

  it('no mês atual, a previsão parte do saldo já realizado (inclui o recebido no mês)', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo, { initialBalance: 100000 });
    const now = dayOfMonthOffset(0);

    const income = await service.createIncome(TENANT_ID, account.id, {
      description: 'Salário',
      categoryId: randomUUID(),
      amount: 50000,
      expectedDate: now.iso,
      recurrence: RecurrenceType.UNIQUE,
    });
    await service.receiveIncome(income.id, TENANT_ID, {});
    await service.createPayment(TENANT_ID, account.id, {
      description: 'Internet',
      categoryId: randomUUID(),
      amount: 20000,
      expectedDate: now.iso,
      recurrence: RecurrenceType.UNIQUE,
    });

    const { summary } = await service.getCashFlow(TENANT_ID, { month: now.month, year: now.year, accountId: account.id });

    expect(summary.realizedBalance).toBe(150000);
    expect(summary.projectedInitialBalance).toBe(150000);
    expect(summary.projectedBalance).toBe(130000);
    expect(summary.pendingIncome).toBe(0);
    expect(summary.pendingIncomeCount).toBe(0);
    expect(summary.pendingExpenses).toBe(20000);
    expect(summary.pendingExpensesCount).toBe(1);
  });

  it('em mês futuro, pendentes ficam só no mês enquanto o previsto acumula desde o mês atual', async () => {
    const { service, accountsRepo } = ctx;
    const account = await seedAccount(accountsRepo, { initialBalance: 100000 });
    const now = dayOfMonthOffset(0);
    const next = dayOfMonthOffset(1);

    for (const [when, amount] of [[now, 20000], [next, 30000]] as const) {
      await service.createPayment(TENANT_ID, account.id, {
        description: 'Conta',
        categoryId: randomUUID(),
        amount,
        expectedDate: when.iso,
        recurrence: RecurrenceType.UNIQUE,
      });
    }

    const { summary } = await service.getCashFlow(TENANT_ID, { month: next.month, year: next.year, accountId: account.id });

    expect(summary.pendingExpenses).toBe(30000);
    expect(summary.pendingExpensesCount).toBe(1);
    expect(summary.expectedPayments).toBe(50000);
    expect(summary.realizedBalance).toBe(100000);
    expect(summary.projectedBalance).toBe(50000);
  });
});

describe('CashFlowService — visão consolidada (U17)', () => {
  it('une as contas ativas, some com transferências internas e soma o resumo', async () => {
    const { service, accountsRepo, transfersService } = buildServiceWithTransfers();
    const pf = await seedAccount(accountsRepo, { name: 'PF', initialBalance: 100000 });
    const pj = await seedAccount(accountsRepo, { name: 'PJ', initialBalance: 200000 });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-10T12:00:00.000Z`;
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    await service.createIncome(TENANT_ID, pj.id, { description: 'Nota', categoryId: randomUUID(), amount: 50000, expectedDate: iso, recurrence: RecurrenceType.UNIQUE });
    await service.createPayment(TENANT_ID, pf.id, { description: 'Aluguel', categoryId: randomUUID(), amount: 30000, expectedDate: iso, recurrence: RecurrenceType.UNIQUE });
    await transfersService.createTransfer(TENANT_ID, { sourceAccountId: pj.id, targetAccountId: pf.id, amount: 70000, date: iso, description: 'Pró-labore' });

    const all = await service.getConsolidatedCashFlow(TENANT_ID, month, year);

    expect(all.entries.map((e) => e.description)).toEqual(['Nota']);
    expect(all.payments.map((p) => p.description)).toEqual(['Aluguel']);
    expect(all.transfers).toEqual([]);
    expect(all.summary.initialBalance).toBe(300000);
    expect(all.summary.transferInflow - all.summary.transferOutflow).toBe(0);

    const [pfFlow, pjFlow] = await Promise.all([
      service.getCashFlow(TENANT_ID, { month, year, accountId: pf.id }),
      service.getCashFlow(TENANT_ID, { month, year, accountId: pj.id }),
    ]);
    expect(all.summary.realizedBalance).toBe(pfFlow.summary.realizedBalance + pjFlow.summary.realizedBalance);
    expect(pfFlow.transfers[0].accountId).toBe(pf.id);
  });
});

// ─── Imposto sobre NF (docs/plano-imposto-nf.md) ──────────────────────────────

class FakeCategoriesRepo extends InMemoryRepo<Category> implements CategoriesRepository {
  async findActive(tenantId: string) {
    return this.items.filter((c) => c.tenantId === tenantId && c.active);
  }
  async findByType(tenantId: string, type: CategoryType) {
    return this.items.filter((c) => c.tenantId === tenantId && c.type === type && c.active);
  }
}

function buildServiceWithCategories() {
  const transactionsRepo = new FakeTransactionsRepo();
  const accountsRepo = new FakeAccountsRepo();
  const categoriesRepo = new FakeCategoriesRepo();
  const service = new CashFlowService(transactionsRepo, accountsRepo, undefined, undefined, undefined, categoriesRepo);
  return { service, transactionsRepo, accountsRepo, categoriesRepo };
}

const taxExpenses = (repo: FakeTransactionsRepo) => repo.items.filter((t) => t.originType === OriginType.INVOICE_TAX);

const nf = (overrides: Record<string, unknown> = {}) => ({
  description: 'NF',
  categoryId: randomUUID(),
  amount: 100000,
  expectedDate: '2026-10-10T00:00:00.000Z',
  issueDate: '2026-10-05T00:00:00.000Z',
  taxRateBps: 600,
  recurrence: RecurrenceType.UNIQUE,
  ...overrides,
});

describe('CashFlowService — Imposto a pagar (I3)', () => {
  let ctx: ReturnType<typeof buildServiceWithCategories>;
  let account: Account;

  beforeEach(async () => {
    ctx = buildServiceWithCategories();
    account = await seedAccount(ctx.accountsRepo, { invoiceTaxEnabled: true, invoiceTaxDueDay: 15 });
  });

  it('10 NFs do mês geram uma única despesa com a soma dos impostos', async () => {
    const { service, transactionsRepo, categoriesRepo } = ctx;
    for (let i = 0; i < 10; i++) {
      await service.createIncome(TENANT_ID, account.id, nf({ amount: 100001 + i, targetAccountId: account.id }));
    }

    const expenses = taxExpenses(transactionsRepo);
    expect(expenses).toHaveLength(1);
    const [tax] = expenses;
    const expected = Array.from({ length: 10 }, (_, i) => Math.round(((100001 + i) * 600) / 10000)).reduce((a, b) => a + b);
    expect(tax).toMatchObject({
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      description: 'Imposto a pagar',
      amount: expected,
      sourceAccountId: account.id,
      originId: `${account.id}:2026-10`,
      expectedDate: '2026-11-15T00:00:00.000Z',
      recurrence: RecurrenceType.UNIQUE,
    });
    const category = categoriesRepo.items.find((c) => c.id === tax.categoryId);
    expect(category).toMatchObject({ name: 'Impostos', type: CategoryType.EXPENSE });
  });

  it('reaproveita a categoria "Impostos" já existente', async () => {
    const { service, transactionsRepo, categoriesRepo } = ctx;
    const now = new Date().toISOString();
    await categoriesRepo.create({
      id: 'cat-impostos',
      tenantId: TENANT_ID,
      name: 'Impostos',
      type: CategoryType.EXPENSE,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await service.createIncome(TENANT_ID, account.id, nf());

    expect(taxExpenses(transactionsRepo)[0].categoryId).toBe('cat-impostos');
    expect(categoriesRepo.items).toHaveLength(1);
  });

  it('entrada sem alíquota não é NF e não gera despesa; alíquota sem emissão é recusada', async () => {
    const { service, transactionsRepo } = ctx;
    const plain = await service.createIncome(TENANT_ID, account.id, nf({ taxRateBps: null }));
    expect(plain.issueDate).toBeNull();
    expect(taxExpenses(transactionsRepo)).toHaveLength(0);

    await expect(service.createIncome(TENANT_ID, account.id, nf({ issueDate: null }))).rejects.toMatchObject({
      code: 'invoiceTax.issueDateRequired',
    });
  });

  it('mudar o mês de emissão recalcula o mês antigo e o novo', async () => {
    const { service, transactionsRepo } = ctx;
    const a = await service.createIncome(TENANT_ID, account.id, nf());
    await service.createIncome(TENANT_ID, account.id, nf({ amount: 50000 }));

    await service.updateIncome(a.id, { issueDate: '2026-11-02T00:00:00.000Z' }, TENANT_ID);

    const oct = taxExpenses(transactionsRepo).find((t) => t.originId === `${account.id}:2026-10`);
    const nov = taxExpenses(transactionsRepo).find((t) => t.originId === `${account.id}:2026-11`);
    expect(oct?.amount).toBe(3000);
    expect(nov?.amount).toBe(6000);
    expect(nov?.expectedDate).toBe('2026-12-15T00:00:00.000Z');
  });

  it('mudar a conta da NF move o imposto para a despesa da outra conta', async () => {
    const { service, transactionsRepo, accountsRepo } = ctx;
    const other = await seedAccount(accountsRepo, { name: 'PJ 2' });
    const a = await service.createIncome(TENANT_ID, account.id, nf());

    await service.updateIncome(a.id, { targetAccountId: other.id }, TENANT_ID);

    const own = taxExpenses(transactionsRepo).find((t) => t.originId === `${account.id}:2026-10`);
    const moved = taxExpenses(transactionsRepo).find((t) => t.originId === `${other.id}:2026-10`);
    expect(own?.status).toBe(TransactionStatus.CANCELED);
    expect(moved).toMatchObject({ amount: 6000, sourceAccountId: other.id, expectedDate: '2026-11-20T00:00:00.000Z' });
  });

  it('tirar a alíquota descarta a emissão e cancela a despesa', async () => {
    const { service, transactionsRepo } = ctx;
    const a = await service.createIncome(TENANT_ID, account.id, nf());

    const updated = await service.updateIncome(a.id, { taxRateBps: null }, TENANT_ID);

    expect(updated).toMatchObject({ taxRateBps: null, issueDate: null });
    expect(taxExpenses(transactionsRepo)[0].status).toBe(TransactionStatus.CANCELED);
  });

  it('excluir a última NF cancela a despesa e uma NF nova reativa a mesma, sem mexer no vencimento', async () => {
    const { service, transactionsRepo } = ctx;
    const a = await service.createIncome(TENANT_ID, account.id, nf());
    const [tax] = taxExpenses(transactionsRepo);
    await service.updatePayment(tax.id, { expectedDate: '2026-11-18T00:00:00.000Z' }, TENANT_ID);

    await service.deleteIncome(a.id, TENANT_ID);
    expect(taxExpenses(transactionsRepo)[0].status).toBe(TransactionStatus.CANCELED);

    await service.createIncome(TENANT_ID, account.id, nf({ amount: 200000 }));
    const after = taxExpenses(transactionsRepo);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: tax.id,
      status: TransactionStatus.PENDING,
      amount: 12000,
      expectedDate: '2026-11-18T00:00:00.000Z',
    });
  });

  it('receber com outro valor e outra data recalcula pelo valor e mantém o mês de emissão', async () => {
    const { service, transactionsRepo } = ctx;
    const a = await service.createIncome(TENANT_ID, account.id, nf());

    const received = await service.receiveIncome(a.id, TENANT_ID, {
      actualDate: '2026-12-03T00:00:00.000Z',
      amountReceived: 150000,
    });

    expect(received.issueDate).toBe('2026-10-05T00:00:00.000Z');
    expect(taxExpenses(transactionsRepo)).toHaveLength(1);
    expect(taxExpenses(transactionsRepo)[0]).toMatchObject({ originId: `${account.id}:2026-10`, amount: 9000 });

    await service.revertIncome(a.id, TENANT_ID);
    expect(taxExpenses(transactionsRepo)[0]).toMatchObject({ status: TransactionStatus.PENDING, amount: 9000 });
  });

  it('despesa paga guarda o valor real; desmarcar o pagamento volta ao calculado', async () => {
    const { service, transactionsRepo } = ctx;
    await service.createIncome(TENANT_ID, account.id, nf());
    const [tax] = taxExpenses(transactionsRepo);

    await service.payPayment(tax.id, TENANT_ID, { amountPaid: 6123 });
    expect(taxExpenses(transactionsRepo)[0]).toMatchObject({ status: TransactionStatus.PAID, amount: 6123 });

    await service.revertPayment(tax.id, TENANT_ID);
    expect(taxExpenses(transactionsRepo)[0]).toMatchObject({ status: TransactionStatus.PENDING, amount: 6000 });
  });

  it('NF fixa gera os meses seguintes com a emissão deslocada e um imposto por mês', async () => {
    const { service, transactionsRepo } = ctx;
    await service.createIncome(
      TENANT_ID,
      account.id,
      nf({ recurrence: RecurrenceType.FIXED, expectedDate: '2026-10-05T00:00:00.000Z', issueDate: '2026-09-30T00:00:00.000Z' }),
    );

    // Duas vezes: o recálculo é idempotente e não duplica nada.
    await service.loadDataset(TENANT_ID, 1, 2027);
    await service.loadDataset(TENANT_ID, 1, 2027);

    const issueDates = transactionsRepo.items
      .filter((t) => t.type === TransactionType.INCOME)
      .map((t) => t.issueDate)
      .sort();
    expect(issueDates).toEqual([
      '2026-09-30T00:00:00.000Z',
      '2026-10-30T00:00:00.000Z',
      '2026-11-30T00:00:00.000Z',
      '2026-12-30T00:00:00.000Z',
    ]);
    const keys = taxExpenses(transactionsRepo).map((t) => t.originId).sort();
    expect(keys).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'].map((m) => `${account.id}:${m}`));
    expect(taxExpenses(transactionsRepo).every((t) => t.amount === 6000)).toBe(true);
  });

  it('NF fixa com emissão no dia 31 não encurta a emissão depois de um mês curto', async () => {
    const { service, transactionsRepo } = ctx;
    await service.createIncome(
      TENANT_ID,
      account.id,
      nf({ recurrence: RecurrenceType.FIXED, expectedDate: '2027-01-10T00:00:00.000Z', issueDate: '2027-01-31T00:00:00.000Z' }),
    );

    await service.loadDataset(TENANT_ID, 3, 2027);

    const issueDates = transactionsRepo.items
      .filter((t) => t.type === TransactionType.INCOME)
      .map((t) => t.issueDate)
      .sort();
    expect(issueDates).toEqual(['2027-01-31T00:00:00.000Z', '2027-02-28T00:00:00.000Z', '2027-03-31T00:00:00.000Z']);
  });

  it('"esta e as futuras" propaga a alíquota mas não a data de emissão', async () => {
    const { service, transactionsRepo } = ctx;
    const first = await service.createIncome(
      TENANT_ID,
      account.id,
      nf({ recurrence: RecurrenceType.FIXED, expectedDate: '2026-10-05T00:00:00.000Z', issueDate: '2026-10-01T00:00:00.000Z' }),
    );
    await service.loadDataset(TENANT_ID, 12, 2026);

    await service.updateIncome(
      first.id,
      { taxRateBps: 1000, issueDate: '2026-10-03T00:00:00.000Z' },
      TENANT_ID,
      'CURRENT_AND_FUTURE',
      10,
      2026,
    );

    const incomes = transactionsRepo.items
      .filter((t) => t.type === TransactionType.INCOME)
      .sort((x, y) => x.expectedDate.localeCompare(y.expectedDate));
    expect(incomes.map((t) => t.taxRateBps)).toEqual([1000, 1000, 1000]);
    expect(incomes.map((t) => t.issueDate)).toEqual([
      '2026-10-03T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
      '2026-12-01T00:00:00.000Z',
    ]);
    expect(taxExpenses(transactionsRepo).every((t) => t.amount === 10000)).toBe(true);
  });

  it('"esta e as futuras" que liga a NF numa série comum dá emissão às futuras', async () => {
    const { service, transactionsRepo } = ctx;
    const first = await service.createIncome(
      TENANT_ID,
      account.id,
      nf({ recurrence: RecurrenceType.FIXED, taxRateBps: null, issueDate: null, expectedDate: '2026-10-05T00:00:00.000Z' }),
    );
    await service.loadDataset(TENANT_ID, 11, 2026);

    await service.updateIncome(
      first.id,
      { taxRateBps: 600, issueDate: '2026-10-05T00:00:00.000Z' },
      TENANT_ID,
      'CURRENT_AND_FUTURE',
      10,
      2026,
    );

    const keys = taxExpenses(transactionsRepo).map((t) => t.originId).sort();
    expect(keys).toEqual([`${account.id}:2026-10`, `${account.id}:2026-11`]);
  });

  it('excluir "esta e as futuras" de uma NF fixa cancela os impostos dos meses atingidos', async () => {
    const { service, transactionsRepo } = ctx;
    const first = await service.createIncome(
      TENANT_ID,
      account.id,
      nf({ recurrence: RecurrenceType.FIXED, expectedDate: '2026-10-05T00:00:00.000Z', issueDate: '2026-10-01T00:00:00.000Z' }),
    );
    await service.loadDataset(TENANT_ID, 12, 2026);

    await service.deleteIncome(first.id, TENANT_ID, 'CURRENT_AND_FUTURE', 11, 2026);

    const statusByKey = Object.fromEntries(taxExpenses(transactionsRepo).map((t) => [t.originId, t.status]));
    expect(statusByKey).toEqual({
      [`${account.id}:2026-10`]: TransactionStatus.PENDING,
      [`${account.id}:2026-11`]: TransactionStatus.CANCELED,
      [`${account.id}:2026-12`]: TransactionStatus.CANCELED,
    });
  });
});
