import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors/app-error';
import { Account } from '../accounts/accounts.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { TenantBootstrapService } from '../tenant-bootstrap/tenant-bootstrap.service';
import { OnboardingService } from './onboarding.service';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import {
  OnboardingMessage,
  OnboardingMessageRole,
  OnboardingMessageStatus,
  OnboardingState,
  OnboardingStatus,
} from './onboarding.types';

const TENANT_ID = 'tenant-a';
const OTHER_TENANT_ID = 'tenant-b';

class InMemoryStateRepo implements OnboardingStateRepository {
  items: OnboardingState[] = [];

  async get(tenantId: string): Promise<OnboardingState | null> {
    return this.items.find((s) => s.tenantId === tenantId) ?? null;
  }
  async upsert(data: OnboardingState): Promise<OnboardingState> {
    const index = this.items.findIndex((s) => s.tenantId === data.tenantId);
    if (index === -1) this.items.push(data);
    else this.items[index] = data;
    return data;
  }
  async deleteAll(tenantId: string): Promise<void> {
    this.items = this.items.filter((s) => s.tenantId !== tenantId);
  }
}

class InMemoryMessagesRepo implements OnboardingMessagesRepository {
  items: OnboardingMessage[] = [];

  async findAll(tenantId: string): Promise<OnboardingMessage[]> {
    return this.items
      .filter((m) => m.tenantId === tenantId)
      .sort((a, b) => a.turn - b.turn || a.createdAt.localeCompare(b.createdAt));
  }
  async create(data: OnboardingMessage): Promise<OnboardingMessage> {
    this.items.push(data);
    return data;
  }
  async deleteAll(tenantId: string): Promise<void> {
    this.items = this.items.filter((m) => m.tenantId !== tenantId);
  }
}

class InMemoryAccountsRepo implements AccountsRepository {
  items: Account[] = [];

  async findAll(tenantId: string): Promise<Account[]> {
    return this.items.filter((a) => a.tenantId === tenantId);
  }
  async findById(id: string, tenantId: string): Promise<Account | null> {
    return this.items.find((a) => a.id === id && a.tenantId === tenantId) ?? null;
  }
  async findActive(tenantId: string): Promise<Account[]> {
    return this.items.filter((a) => a.tenantId === tenantId && a.active);
  }
  async create(data: Account): Promise<Account> {
    this.items.push(data);
    return data;
  }
  async update(id: string, data: Partial<Account>, tenantId: string): Promise<Account> {
    const index = this.items.findIndex((a) => a.id === id && a.tenantId === tenantId);
    if (index === -1) throw new Error('not found');
    this.items[index] = { ...this.items[index], ...data };
    return this.items[index];
  }
  async delete(id: string, tenantId: string): Promise<void> {
    this.items = this.items.filter((a) => !(a.id === id && a.tenantId === tenantId));
  }
  async replaceAll(tenantId: string, items: Account[]): Promise<void> {
    this.items = this.items.filter((a) => a.tenantId !== tenantId).concat(items);
  }
}

function makeAccount(tenantId: string): Account {
  return {
    id: `acc-${Math.random()}`,
    tenantId,
    name: 'Conta',
    accountTypeId: 'type-1',
    initialBalance: 0,
    active: true,
    autoReserveEnabled: false,
    autoReservePercentage: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Account;
}

class FakeTenantBootstrap {
  calls: string[] = [];
  async seedDefaults(tenantId: string): Promise<void> {
    this.calls.push(tenantId);
  }
}

function makeMessage(tenantId: string, turn: number, createdAt: string): OnboardingMessage {
  return {
    id: `msg-${Math.random()}`,
    tenantId,
    role: OnboardingMessageRole.USER,
    content: `mensagem ${turn}`,
    turn,
    status: OnboardingMessageStatus.OK,
    createdAt,
  };
}

describe('OnboardingService', () => {
  let stateRepo: InMemoryStateRepo;
  let messagesRepo: InMemoryMessagesRepo;
  let accountsRepo: InMemoryAccountsRepo;
  let tenantBootstrap: FakeTenantBootstrap;
  let service: OnboardingService;

  beforeEach(() => {
    stateRepo = new InMemoryStateRepo();
    messagesRepo = new InMemoryMessagesRepo();
    accountsRepo = new InMemoryAccountsRepo();
    tenantBootstrap = new FakeTenantBootstrap();
    service = new OnboardingService(
      stateRepo,
      messagesRepo,
      accountsRepo,
      tenantBootstrap as unknown as TenantBootstrapService,
    );
  });

  describe('getState', () => {
    it('cria estado PENDING com draft vazio para tenant novo', async () => {
      const state = await service.getState(TENANT_ID);
      expect(state.status).toBe(OnboardingStatus.PENDING);
      expect(state.draft.accounts).toEqual([]);
      expect(state.draft.settings).toBeNull();
      expect(state.appliedEntityIds).toEqual({});
    });

    it('persiste e reutiliza o estado nas próximas consultas', async () => {
      const first = await service.getState(TENANT_ID);
      const second = await service.getState(TENANT_ID);
      expect(second.id).toBe(first.id);
      expect(stateRepo.items).toHaveLength(1);
    });

    it('marca COMPLETED_MANUAL retroativo para tenant que já possui contas', async () => {
      accountsRepo.items.push(makeAccount(TENANT_ID));
      const state = await service.getState(TENANT_ID);
      expect(state.status).toBe(OnboardingStatus.COMPLETED_MANUAL);
    });

    it('isola estados por tenant', async () => {
      accountsRepo.items.push(makeAccount(OTHER_TENANT_ID));
      const stateA = await service.getState(TENANT_ID);
      const stateB = await service.getState(OTHER_TENANT_ID);
      expect(stateA.status).toBe(OnboardingStatus.PENDING);
      expect(stateB.status).toBe(OnboardingStatus.COMPLETED_MANUAL);
    });
  });

  describe('transições', () => {
    it('skip a partir de PENDING', async () => {
      const state = await service.skip(TENANT_ID);
      expect(state.status).toBe(OnboardingStatus.SKIPPED);
    });

    it('skip aciona o seedDefaults — é o único caminho que cria a base padrão automaticamente', async () => {
      await service.skip(TENANT_ID);
      expect(tenantBootstrap.calls).toEqual([TENANT_ID]);
    });

    it('completeManual a partir de SKIPPED', async () => {
      await service.skip(TENANT_ID);
      const state = await service.completeManual(TENANT_ID);
      expect(state.status).toBe(OnboardingStatus.COMPLETED_MANUAL);
    });

    it('percorre o fluxo feliz do assistente', async () => {
      await service.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
      await service.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION);
      const state = await service.transition(TENANT_ID, OnboardingStatus.COMPLETED);
      expect(state.status).toBe(OnboardingStatus.COMPLETED);
    });

    it('permite voltar de AWAITING_CONFIRMATION para IN_PROGRESS', async () => {
      await service.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
      await service.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION);
      const state = await service.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
      expect(state.status).toBe(OnboardingStatus.IN_PROGRESS);
    });

    it('rejeita skip depois de concluído', async () => {
      await service.completeManual(TENANT_ID);
      await expect(service.skip(TENANT_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: 'onboarding.invalidTransition',
      });
    });

    it('rejeita pular direto de PENDING para AWAITING_CONFIRMATION', async () => {
      await expect(
        service.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejeita qualquer transição a partir de COMPLETED', async () => {
      await service.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
      await service.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION);
      await service.transition(TENANT_ID, OnboardingStatus.COMPLETED);
      await expect(
        service.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS),
      ).rejects.toMatchObject({ code: 'onboarding.invalidTransition' });
    });

    it('transição de um tenant não afeta o outro', async () => {
      await service.skip(TENANT_ID);
      const other = await service.getState(OTHER_TENANT_ID);
      expect(other.status).toBe(OnboardingStatus.PENDING);
    });
  });

  describe('conversa e draft', () => {
    it('retorna conversa vazia para tenant novo (retomada sem histórico)', async () => {
      expect(await service.getConversation(TENANT_ID)).toEqual([]);
    });

    it('retorna mensagens ordenadas por turno, isoladas por tenant', async () => {
      await messagesRepo.create(makeMessage(TENANT_ID, 2, '2026-01-02T00:00:00.000Z'));
      await messagesRepo.create(makeMessage(TENANT_ID, 1, '2026-01-01T00:00:00.000Z'));
      await messagesRepo.create(makeMessage(OTHER_TENANT_ID, 1, '2026-01-01T00:00:00.000Z'));

      const messages = await service.getConversation(TENANT_ID);
      expect(messages.map((m) => m.turn)).toEqual([1, 2]);
    });

    it('retorna o draft do estado', async () => {
      const draft = await service.getDraft(TENANT_ID);
      expect(draft.accountTypes).toEqual([]);
      expect(draft.creditCards).toEqual([]);
    });
  });
});
