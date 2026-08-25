import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { Account } from '../accounts/accounts.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CategoryType } from '../categories/categories.types';
import { TenantBootstrapService } from '../tenant-bootstrap/tenant-bootstrap.service';
import { OnboardingService } from './onboarding.service';
import { OnboardingDraftService } from './onboarding-draft.service';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import { OnboardingMessage, OnboardingState, OnboardingStatus } from './onboarding.types';

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
    return this.items.filter((m) => m.tenantId === tenantId);
  }
  async create(data: OnboardingMessage): Promise<OnboardingMessage> {
    this.items.push(data);
    return data;
  }
  async deleteAll(tenantId: string): Promise<void> {
    this.items = this.items.filter((m) => m.tenantId !== tenantId);
  }
}

class EmptyAccountsRepo {
  async findAll(): Promise<Account[]> {
    return [];
  }
}

describe('OnboardingDraftService', () => {
  let stateRepo: InMemoryStateRepo;
  let service: OnboardingDraftService;
  let onboardingService: OnboardingService;

  beforeEach(() => {
    stateRepo = new InMemoryStateRepo();
    onboardingService = new OnboardingService(
      stateRepo,
      new InMemoryMessagesRepo(),
      new EmptyAccountsRepo() as unknown as AccountsRepository,
      { seedDefaults: async () => {} } as unknown as TenantBootstrapService,
    );
    service = new OnboardingDraftService(onboardingService, stateRepo);
  });

  async function addAccount(overrides: Record<string, unknown> = {}, tenantId = TENANT_ID) {
    return service.addItem(
      tenantId,
      'accounts',
      { name: 'Conta Corrente', ...overrides },
      'user',
    );
  }

  async function addCategory(type: CategoryType, name: string, tenantId = TENANT_ID) {
    return service.addItem(tenantId, 'categories', { name, type }, 'user');
  }

  describe('criação', () => {
    it('gera draftItemId sequencial por seção e aplica defaults do schema', async () => {
      const first = await addAccount();
      const second = await addAccount({ name: 'Reserva' });
      expect(first.item.draftItemId).toBe('acc_1');
      expect(second.item.draftItemId).toBe('acc_2');
      expect(first.item.payload.initialBalance).toBe(0);
      expect(first.item.payload.isMain).toBe(false);
    });

    it('não reutiliza número após remoção', async () => {
      await addAccount();
      await addAccount({ name: 'Reserva' });
      await service.removeItem(TENANT_ID, 'acc_2');
      const third = await addAccount({ name: 'Nova' });
      expect(third.item.draftItemId).toBe('acc_3');
    });

    it('rejeita valores monetários não inteiros (centavos)', async () => {
      await expect(addAccount({ initialBalance: 10.5 })).rejects.toBeInstanceOf(ZodError);
    });

    it('rejeita percentual de reserva fora de 0–100', async () => {
      await expect(
        addAccount({ autoReserveEnabled: true, autoReservePercentage: 120 }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it('settings é singleton: nova proposta substitui a anterior', async () => {
      await service.addItem(TENANT_ID, 'settings', { controlScope: 'PERSONAL' }, 'user');
      const second = await service.addItem(
        TENANT_ID,
        'settings',
        { controlScope: 'BOTH' },
        'ai',
      );
      expect(second.item.draftItemId).toBe('settings');
      expect(second.state.draft.settings?.payload.controlScope).toBe('BOTH');
    });

    it('rejeita nome duplicado na mesma seção (case-insensitive)', async () => {
      await addAccount({ name: 'Nubank' });
      await expect(addAccount({ name: '  nubank ' })).rejects.toMatchObject({
        code: 'onboarding.draft.duplicateName',
      });
    });

    it('rejeita segunda conta principal', async () => {
      await addAccount({ name: 'Principal', isMain: true });
      await expect(addAccount({ name: 'Outra', isMain: true })).rejects.toMatchObject({
        code: 'onboarding.draft.mainAccountDuplicate',
      });
    });

    it('rejeita conta marcada como principal e como reserva ao mesmo tempo', async () => {
      await expect(
        addAccount({ isMain: true, autoReserveEnabled: true, autoReservePercentage: 10 }),
      ).rejects.toMatchObject({ code: 'onboarding.draft.mainReserveConflict' });
    });

    it('rejeita ref inexistente', async () => {
      await expect(
        addAccount({ accountTypeRef: 'atype_99' }),
      ).rejects.toMatchObject({ code: 'onboarding.draft.invalidRef' });
    });

    it('rejeita receita apontando para categoria de despesa', async () => {
      await addCategory(CategoryType.EXPENSE, 'Moradia');
      await expect(
        service.addItem(
          TENANT_ID,
          'incomes',
          {
            description: 'Salário',
            grossAmount: 500000,
            dayOfMonth: 5,
            incomeCategoryRef: 'cat_1',
          },
          'user',
        ),
      ).rejects.toMatchObject({ code: 'onboarding.draft.invalidRef' });
    });

    it('aceita receita completa com refs válidas', async () => {
      await addAccount({ name: 'Principal', isMain: true });
      await addAccount({ name: 'Reserva', autoReserveEnabled: true, autoReservePercentage: 20 });
      await addCategory(CategoryType.INCOME, 'Salário');
      const result = await service.addItem(
        TENANT_ID,
        'incomes',
        {
          description: 'Salário mensal',
          grossAmount: 500000,
          dayOfMonth: 5,
          incomeCategoryRef: 'cat_1',
          reserveAccountRefs: ['acc_2'],
          targetAccountRef: 'acc_1',
        },
        'ai',
      );
      expect(result.item.draftItemId).toBe('inc_1');
      expect(result.item.source).toBe('ai');
    });
  });

  describe('edição', () => {
    it('mescla patch com payload atual e revalida', async () => {
      await addAccount({ name: 'Conta', initialBalance: 1000 });
      const result = await service.updateItem(TENANT_ID, 'acc_1', { isMain: true }, 'user');
      expect(result.item.payload.isMain).toBe(true);
      expect(result.item.payload.initialBalance).toBe(1000);
    });

    it('rejeita patch que viola o schema', async () => {
      await addAccount();
      await expect(
        service.updateItem(TENANT_ID, 'acc_1', { initialBalance: -5 }, 'user'),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it('rejeita patch que cria segunda conta principal', async () => {
      await addAccount({ name: 'A', isMain: true });
      await addAccount({ name: 'B' });
      await expect(
        service.updateItem(TENANT_ID, 'acc_2', { isMain: true }, 'user'),
      ).rejects.toMatchObject({ code: 'onboarding.draft.mainAccountDuplicate' });
    });

    it('rejeita patch que marca reserva na conta já principal', async () => {
      await addAccount({ name: 'Principal', isMain: true });
      await expect(
        service.updateItem(TENANT_ID, 'acc_1', { autoReserveEnabled: true }, 'user'),
      ).rejects.toMatchObject({ code: 'onboarding.draft.mainReserveConflict' });
    });

    it('retorna 404 para item inexistente', async () => {
      await expect(
        service.updateItem(TENANT_ID, 'acc_9', { name: 'X' }, 'user'),
      ).rejects.toMatchObject({ statusCode: 404, code: 'onboarding.draft.itemNotFound' });
    });
  });

  describe('remoção', () => {
    it('remove item sem referências', async () => {
      await addAccount();
      const state = await service.removeItem(TENANT_ID, 'acc_1');
      expect(state.draft.accounts).toHaveLength(0);
    });

    it('bloqueia remoção de item referenciado', async () => {
      await addAccount({ name: 'Pagadora' });
      await service.addItem(
        TENANT_ID,
        'creditCards',
        {
          name: 'Cartão',
          bank: 'Banco',
          closingDay: 5,
          dueDay: 12,
          defaultPaymentAccountRef: 'acc_1',
        },
        'user',
      );
      await expect(service.removeItem(TENANT_ID, 'acc_1')).rejects.toMatchObject({
        code: 'onboarding.draft.refInUse',
      });
    });

    it('remove settings zerando a seção', async () => {
      await service.addItem(TENANT_ID, 'settings', { controlScope: 'PERSONAL' }, 'user');
      const state = await service.removeItem(TENANT_ID, 'settings');
      expect(state.draft.settings).toBeNull();
    });
  });

  describe('estado e tenant', () => {
    it('bloqueia edição quando o onboarding já terminou', async () => {
      await onboardingService.skip(TENANT_ID);
      await expect(addAccount()).rejects.toMatchObject({
        statusCode: 409,
        code: 'onboarding.draft.locked',
      });
    });

    it('permite edição em AWAITING_CONFIRMATION (ajustes na revisão)', async () => {
      await onboardingService.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
      await onboardingService.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION);
      const result = await addAccount();
      expect(result.item.draftItemId).toBe('acc_1');
    });

    it('drafts são isolados por tenant', async () => {
      await addAccount();
      await addAccount({ name: 'Outro tenant' }, OTHER_TENANT_ID);
      const stateA = await onboardingService.getState(TENANT_ID);
      const stateB = await onboardingService.getState(OTHER_TENANT_ID);
      expect(stateA.draft.accounts).toHaveLength(1);
      expect(stateB.draft.accounts).toHaveLength(1);
      expect(stateB.draft.accounts[0].draftItemId).toBe('acc_1');
      expect(stateB.draft.accounts[0].payload.name).toBe('Outro tenant');
    });
  });
});
