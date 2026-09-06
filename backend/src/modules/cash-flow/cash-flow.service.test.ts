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
