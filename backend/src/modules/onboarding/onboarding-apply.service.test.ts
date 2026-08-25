import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../accounts/accounts.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CategoryType } from '../categories/categories.types';
import { TenantBootstrapService } from '../tenant-bootstrap/tenant-bootstrap.service';
import { OnboardingService } from './onboarding.service';
import { OnboardingDraftService } from './onboarding-draft.service';
import { OnboardingApplyService, OnboardingApplyServices } from './onboarding-apply.service';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import { OnboardingMessage, OnboardingState, OnboardingStatus } from './onboarding.types';

const TENANT_ID = 'tenant-a';
const OTHER_TENANT_ID = 'tenant-b';
const KEY_1 = '11111111-1111-4111-8111-111111111111';
const KEY_2 = '22222222-2222-4222-8222-222222222222';

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
  async findAll(): Promise<OnboardingMessage[]> {
    return [];
  }
  async create(data: OnboardingMessage): Promise<OnboardingMessage> {
    return data;
  }
  async deleteAll(): Promise<void> {}
}

/** Serviço de criação fake: registra chamadas e devolve entidades com id. */
class FakeCreator<TInput extends { name?: string; description?: string }> {
  calls: Array<{ tenantId: string; input: TInput }> = [];
  created: Array<{ id: string; tenantId: string; name: string }> = [];
  failOnCall: number | null = null;
  private counter = 0;

  async create(tenantId: string, input: TInput): Promise<{ id: string }> {
    this.calls.push({ tenantId, input });
    if (this.failOnCall !== null && this.calls.length === this.failOnCall) {
      throw new Error('falha simulada');
    }
    this.counter += 1;
    const entity = {
      id: `ent-${Math.random().toString(36).slice(2, 8)}-${this.counter}`,
      tenantId,
      name: (input.name ?? input.description ?? '') as string,
    };
    this.created.push(entity);
    return entity;
  }

  // Repositório de leitura correspondente (reuso por nome)
  repo() {
    return {
      findAll: async (tenantId: string) => this.created.filter((c) => c.tenantId === tenantId),
    };
  }
}

class FakeSettingsService {
  calls: Array<{ tenantId: string; input: Record<string, unknown> }> = [];
  async get(): Promise<{ id: string }> {
    return { id: 'settings-1' };
  }
  async update(tenantId: string, input: Record<string, unknown>): Promise<{ id: string }> {
    this.calls.push({ tenantId, input });
    return { id: 'settings-1' };
  }
}

function setup() {
  const stateRepo = new InMemoryStateRepo();
  const accountsCreator = new FakeCreator();
  const accountTypesCreator = new FakeCreator();
  const categoriesCreator = new FakeCreator();
  const creditCardsCreator = new FakeCreator();
  const incomeCreator = new FakeCreator();
  const paymentsCreator = new FakeCreator();
  const settingsService = new FakeSettingsService();

  const emptyAccountsRepo = { findAll: async () => [] as Account[] };
  const onboardingService = new OnboardingService(
    stateRepo,
    new InMemoryMessagesRepo(),
    emptyAccountsRepo as unknown as AccountsRepository,
    { seedDefaults: async () => {} } as unknown as TenantBootstrapService,
  );
  const draftService = new OnboardingDraftService(onboardingService, stateRepo);

  const services = {
    accountTypesService: accountTypesCreator,
    accountsService: accountsCreator,
    categoriesService: categoriesCreator,
    settingsService,
    creditCardsService: creditCardsCreator,
    cashFlowService: {
      createPayment: (tenantId: string, _accountId: string, input: unknown) =>
        paymentsCreator.create(tenantId, input as never),
      createIncome: (tenantId: string, _accountId: string, input: unknown) =>
        incomeCreator.create(tenantId, input as never),
    },
    accountTypesRepo: accountTypesCreator.repo(),
    accountsRepo: accountsCreator.repo(),
    categoriesRepo: categoriesCreator.repo(),
    creditCardsRepo: creditCardsCreator.repo(),
  } as unknown as OnboardingApplyServices;

  const applyService = new OnboardingApplyService(onboardingService, stateRepo, services);

  return {
    applyService,
    draftService,
    onboardingService,
    stateRepo,
    accountsCreator,
    accountTypesCreator,
    categoriesCreator,
    creditCardsCreator,
    incomeCreator,
    paymentsCreator,
    settingsService,
  };
}

/** Draft completo padrão: tipo, 2 contas (1 principal, 1 reserva), categoria, receita, despesa, cartão, settings. */
async function buildFullDraft(draftService: OnboardingDraftService, tenantId = TENANT_ID) {
  await draftService.addItem(tenantId, 'accountTypes', { name: 'Conta corrente' }, 'ai');
  await draftService.addItem(
    tenantId,
    'accounts',
    { name: 'Principal', accountTypeRef: 'atype_1', isMain: true, initialBalance: 100000 },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'accounts',
    { name: 'Reserva Impostos', autoReserveEnabled: true, autoReservePercentage: 15 },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'categories',
    { name: 'Serviços', type: CategoryType.INCOME },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'categories',
    { name: 'Moradia', type: CategoryType.EXPENSE },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'incomes',
    {
      description: 'Contrato mensal',
      grossAmount: 1200000,
      dayOfMonth: 10,
      incomeCategoryRef: 'cat_1',
      reserveAccountRefs: ['acc_2'],
      targetAccountRef: 'acc_1',
    },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'expenses',
    { description: 'Aluguel', amount: 250000, dayOfMonth: 5, categoryRef: 'cat_2' },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'creditCards',
    { name: 'Cartão X', bank: 'Banco X', closingDay: 5, dueDay: 12, defaultPaymentAccountRef: 'acc_1' },
    'ai',
  );
  await draftService.addItem(
    tenantId,
    'settings',
    { controlScope: 'BOTH' },
    'ai',
  );
}

async function moveToAwaiting(onboardingService: OnboardingService, tenantId = TENANT_ID) {
  await onboardingService.transition(tenantId, OnboardingStatus.IN_PROGRESS);
  await onboardingService.transition(tenantId, OnboardingStatus.AWAITING_CONFIRMATION);
}

describe('OnboardingApplyService', () => {
  it('aplica o draft completo na ordem, resolvendo refs para ids reais', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);

    const result = await ctx.applyService.confirm(TENANT_ID, KEY_1);

    expect(result.status).toBe(OnboardingStatus.COMPLETED);
    expect(result.alreadyApplied).toBe(false);
    expect(Object.keys(result.appliedEntityIds).sort()).toEqual(
      ['acc_1', 'acc_2', 'atype_1', 'card_1', 'cat_1', 'cat_2', 'exp_1', 'inc_1', 'settings'].sort(),
    );

    // Refs resolvidas para ids reais
    const accountTypeId = result.appliedEntityIds.atype_1;
    expect(ctx.accountsCreator.calls[0].input).toMatchObject({
      name: 'Principal',
      accountTypeId,
    });
    const incomeInput = ctx.incomeCreator.calls[0].input as Record<string, unknown>;
    expect(incomeInput.categoryId).toBe(result.appliedEntityIds.cat_1);
    expect(incomeInput.amount).toBe(1200000);
    expect(incomeInput.targetAccountId).toBe(result.appliedEntityIds.acc_1);

    const state = await ctx.onboardingService.getState(TENANT_ID);
    expect(state.appliedAt).not.toBeNull();
    expect(state.confirmIdempotencyKey).toBe(KEY_1);
  });

  it('mesma chave repetida após conclusão devolve o resultado anterior sem recriar nada', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);
    const first = await ctx.applyService.confirm(TENANT_ID, KEY_1);
    const creations = ctx.accountsCreator.calls.length;

    const replay = await ctx.applyService.confirm(TENANT_ID, KEY_1);

    expect(replay.alreadyApplied).toBe(true);
    expect(replay.appliedEntityIds).toEqual(first.appliedEntityIds);
    expect(ctx.accountsCreator.calls.length).toBe(creations);
  });

  it('nova chave após conclusão é rejeitada', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);
    await ctx.applyService.confirm(TENANT_ID, KEY_1);

    await expect(ctx.applyService.confirm(TENANT_ID, KEY_2)).rejects.toMatchObject({
      statusCode: 409,
      code: 'onboarding.confirm.alreadyCompleted',
    });
  });

  it('falha parcial: retomada completa o restante sem duplicar', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);

    // Falha na criação da 2ª conta (depois de tipo e 1ª conta criados)
    ctx.accountsCreator.failOnCall = 2;
    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toThrow('falha simulada');

    let state = await ctx.onboardingService.getState(TENANT_ID);
    expect(state.status).toBe(OnboardingStatus.AWAITING_CONFIRMATION);
    expect(state.appliedEntityIds.atype_1).toBeDefined();
    expect(state.appliedEntityIds.acc_1).toBeDefined();
    expect(state.appliedEntityIds.acc_2).toBeUndefined();

    // Retomada com nova chave (nova tentativa)
    ctx.accountsCreator.failOnCall = null;
    const result = await ctx.applyService.confirm(TENANT_ID, KEY_2);

    expect(result.status).toBe(OnboardingStatus.COMPLETED);
    // A 1ª conta e o tipo NÃO foram recriados
    expect(ctx.accountTypesCreator.calls).toHaveLength(1);
    const accountNames = ctx.accountsCreator.calls.map((c) => (c.input as { name: string }).name);
    expect(accountNames).toEqual(['Principal', 'Reserva Impostos', 'Reserva Impostos']);
    // (a 2ª chamada falhou sem criar; a 3ª criou de fato)
    expect(ctx.accountsCreator.created).toHaveLength(2);
  });

  it('entidade existente com o mesmo nome é reusada, não duplicada', async () => {
    const ctx = setup();
    // Categoria "Serviços" já existe no tenant (ex.: criada por outra via)
    ctx.categoriesCreator.created.push({ id: 'cat-existente', tenantId: TENANT_ID, name: 'serviços' });
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);

    const result = await ctx.applyService.confirm(TENANT_ID, KEY_1);

    expect(result.appliedEntityIds.cat_1).toBe('cat-existente');
    // Só a categoria de despesa foi criada
    expect(ctx.categoriesCreator.calls).toHaveLength(1);
    expect((ctx.categoriesCreator.calls[0].input as { name: string }).name).toBe('Moradia');
  });

  it('rejeita confirmação sem estar em AWAITING_CONFIRMATION', async () => {
    const ctx = setup();
    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'onboarding.confirm.invalidState',
    });
  });

  it('rejeita draft vazio e draft sem conta principal', async () => {
    const ctx = setup();
    await moveToAwaiting(ctx.onboardingService);
    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toMatchObject({
      code: 'onboarding.confirm.emptyDraft',
    });

    await ctx.onboardingService.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
    await ctx.draftService.addItem(TENANT_ID, 'accounts', { name: 'Sem principal' }, 'ai');
    await ctx.onboardingService.transition(TENANT_ID, OnboardingStatus.AWAITING_CONFIRMATION);
    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toMatchObject({
      code: 'onboarding.confirm.mainAccountRequired',
    });
  });

  it('rejeita conta principal marcada também como reserva antes de escrever qualquer dado', async () => {
    const ctx = setup();
    await ctx.draftService.addItem(TENANT_ID, 'accounts', { name: 'Conta', isMain: true }, 'ai');
    // Corrompe o draft direto no repo para simular um estado que escapou da
    // validação do draft service (defesa em profundidade antes da aplicação).
    const state = (await ctx.stateRepo.get(TENANT_ID)) as OnboardingState;
    (state.draft.accounts[0].payload as Record<string, unknown>).autoReserveEnabled = true;
    await ctx.stateRepo.upsert(state);
    await moveToAwaiting(ctx.onboardingService);

    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toMatchObject({
      code: 'onboarding.draft.mainReserveConflict',
    });
    expect(ctx.accountsCreator.calls).toHaveLength(0);
  });

  it('rejeita refs inválidas antes de escrever qualquer dado', async () => {
    const ctx = setup();
    await ctx.draftService.addItem(TENANT_ID, 'accounts', { name: 'Conta', isMain: true }, 'ai');
    // Corrompe o draft direto no repo para simular ref órfã
    const state = (await ctx.stateRepo.get(TENANT_ID)) as OnboardingState;
    state.draft.expenses.push({
      draftItemId: 'exp_1',
      source: 'ai',
      payload: {
        description: 'Órfã',
        amount: 1000,
        dayOfMonth: 5,
        categoryRef: 'cat_99',
        recurrence: 'FIXED',
      },
      createdAt: '',
      updatedAt: '',
    });
    await ctx.stateRepo.upsert(state);
    await moveToAwaiting(ctx.onboardingService);

    await expect(ctx.applyService.confirm(TENANT_ID, KEY_1)).rejects.toMatchObject({
      code: 'onboarding.draft.invalidRef',
    });
    expect(ctx.accountsCreator.calls).toHaveLength(0);
  });

  it('bloqueia confirmação concorrente do mesmo tenant', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await moveToAwaiting(ctx.onboardingService);

    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const originalCreate = ctx.accountTypesCreator.create.bind(ctx.accountTypesCreator);
    ctx.accountTypesCreator.create = async (tenantId, input) => {
      await gate;
      return originalCreate(tenantId, input);
    };

    const first = ctx.applyService.confirm(TENANT_ID, KEY_1);
    await expect(ctx.applyService.confirm(TENANT_ID, KEY_2)).rejects.toMatchObject({
      code: 'onboarding.confirm.inProgress',
    });
    release();
    await expect(first).resolves.toMatchObject({ status: OnboardingStatus.COMPLETED });
  });

  it('isola tenants: aplicar A não toca estado nem entidades de B', async () => {
    const ctx = setup();
    await buildFullDraft(ctx.draftService);
    await buildFullDraft(ctx.draftService, OTHER_TENANT_ID);
    await moveToAwaiting(ctx.onboardingService);

    await ctx.applyService.confirm(TENANT_ID, KEY_1);

    const other = await ctx.onboardingService.getState(OTHER_TENANT_ID);
    expect(other.status).toBe(OnboardingStatus.PENDING);
    expect(other.appliedEntityIds).toEqual({});
    expect(ctx.accountsCreator.created.every((c) => c.tenantId === TENANT_ID)).toBe(true);
  });
});
