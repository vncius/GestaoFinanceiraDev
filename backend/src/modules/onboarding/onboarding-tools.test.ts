import { beforeEach, describe, expect, it } from 'vitest';
import { AiToolCall } from '../ai/ai-provider.types';
import { AiToolContext, AiToolErrorOutput } from '../ai/ai-tool.types';
import { AiToolRegistry } from '../ai/tool-registry';
import { Account } from '../accounts/accounts.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CategoriesRepository } from '../categories/categories.repository';
import { Category, CategoryType } from '../categories/categories.types';
import { createOnboardingToolRegistry } from './onboarding-tools';
import { OnboardingService } from './onboarding.service';
import { OnboardingDraftService } from './onboarding-draft.service';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import { OnboardingMessage, OnboardingState, OnboardingStatus } from './onboarding.types';

const TENANT_ID = 'tenant-a';
const CONTEXT: AiToolContext = { tenantId: TENANT_ID, language: 'pt' };

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

class InMemoryFinRepo<T extends { id: string; tenantId: string }> {
  items: T[] = [];
  async findAll(tenantId: string): Promise<T[]> {
    return this.items.filter((i) => i.tenantId === tenantId);
  }
  async findById(id: string, tenantId: string): Promise<T | null> {
    return this.items.find((i) => i.id === id && i.tenantId === tenantId) ?? null;
  }
  async findActive(tenantId: string): Promise<T[]> {
    return this.findAll(tenantId);
  }
  async create(data: T): Promise<T> {
    this.items.push(data);
    return data;
  }
  async update(): Promise<T> {
    throw new Error('não usado');
  }
  async delete(): Promise<void> {}
  async replaceAll(tenantId: string, items: T[]): Promise<void> {
    this.items = this.items.filter((i) => i.tenantId !== tenantId).concat(items);
  }
}

function call(name: string, input: unknown = {}, id = 'call_1'): AiToolCall {
  return { id, name, input };
}

describe('onboarding tools', () => {
  let registry: AiToolRegistry;
  let onboardingService: OnboardingService;
  let accountsRepo: InMemoryFinRepo<Account>;
  let categoriesRepo: InMemoryFinRepo<Category>;

  beforeEach(() => {
    const stateRepo = new InMemoryStateRepo();
    accountsRepo = new InMemoryFinRepo<Account>();
    categoriesRepo = new InMemoryFinRepo<Category>();
    onboardingService = new OnboardingService(
      stateRepo,
      new InMemoryMessagesRepo(),
      accountsRepo as unknown as AccountsRepository,
    );
    const draftService = new OnboardingDraftService(onboardingService, stateRepo);
    registry = createOnboardingToolRegistry({
      onboardingService,
      draftService,
      accountsRepo: accountsRepo as unknown as AccountsRepository,
      categoriesRepo: categoriesRepo as unknown as CategoriesRepository,
    });
  });

  it('expõe exatamente o conjunto fechado de tools do onboarding', () => {
    expect(registry.names().sort()).toEqual([
      'get_onboarding_context',
      'present_setup_summary',
      'propose_account',
      'propose_credit_card',
      'propose_expense',
      'propose_income',
      'propose_settings',
      'remove_draft_item',
      'update_draft_item',
    ]);
  });

  it('get_onboarding_context retorna status, draft, pendências e nomes existentes (sem UUIDs)', async () => {
    categoriesRepo.items.push({
      id: 'uuid-cat',
      tenantId: TENANT_ID,
      name: 'Nota Fiscal',
      type: CategoryType.INCOME,
      active: true,
      protected: true,
      createdAt: '',
      updatedAt: '',
    });
    const result = await registry.execute(call('get_onboarding_context'), CONTEXT);
    expect(result.ok).toBe(true);
    const output = result.output as Record<string, unknown>;
    expect(output.status).toBe(OnboardingStatus.PENDING);
    expect(output.pendencies).toContain('noAccounts');
    expect(output.existingCategories).toEqual([{ name: 'Nota Fiscal', type: 'INCOME' }]);
    expect(JSON.stringify(output)).not.toContain('uuid-cat');
  });

  it('propose_account cria conta e resolve o tipo por nome, reusando na segunda vez', async () => {
    const first = await registry.execute(
      call('propose_account', {
        name: 'Conta PJ',
        accountTypeName: 'Conta corrente',
        isMain: true,
      }),
      CONTEXT,
    );
    expect(first.ok).toBe(true);
    expect((first.output as { draftItemId: string }).draftItemId).toBe('acc_1');

    const second = await registry.execute(
      call('propose_account', { name: 'Conta Pessoal', accountTypeName: 'conta corrente' }),
      CONTEXT,
    );
    expect(second.ok).toBe(true);

    const state = await onboardingService.getState(TENANT_ID);
    expect(state.draft.accountTypes).toHaveLength(1);
    expect(state.draft.accounts).toHaveLength(2);
  });

  it('propose_income cria categoria INCOME por nome e vincula refs', async () => {
    await registry.execute(
      call('propose_account', {
        name: 'Reserva Impostos',
        autoReserveEnabled: true,
        autoReservePercentage: 15,
      }),
      CONTEXT,
    );
    const result = await registry.execute(
      call('propose_income', {
        description: 'Contrato mensal',
        grossAmount: 1500000,
        dayOfMonth: 10,
        categoryName: 'Serviços',
        reserveAccountRefs: ['acc_1'],
      }),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    const state = await onboardingService.getState(TENANT_ID);
    expect(state.draft.categories).toHaveLength(1);
    expect(state.draft.categories[0].payload.type).toBe(CategoryType.INCOME);
    expect(state.draft.incomes[0].payload.incomeCategoryRef).toBe('cat_1');
  });

  it('propose_expense com nome de categoria já usado como INCOME devolve erro estruturado', async () => {
    await registry.execute(
      call('propose_income', {
        description: 'Salário',
        grossAmount: 500000,
        dayOfMonth: 5,
        categoryName: 'Geral',
      }),
      CONTEXT,
    );
    const result = await registry.execute(
      call('propose_expense', {
        description: 'Aluguel',
        amount: 200000,
        dayOfMonth: 10,
        categoryName: 'Geral',
      }),
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    expect((result.output as AiToolErrorOutput).code).toBe('onboarding.draft.duplicateName');
  });

  it('propose_credit_card valida ref da conta pagadora', async () => {
    const result = await registry.execute(
      call('propose_credit_card', {
        name: 'Cartão X',
        bank: 'Banco X',
        closingDay: 5,
        dueDay: 12,
        defaultPaymentAccountRef: 'acc_99',
      }),
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    expect((result.output as AiToolErrorOutput).code).toBe('onboarding.draft.invalidRef');
  });

  it('propose_settings substitui a proposta anterior (singleton)', async () => {
    await registry.execute(call('propose_settings', { controlScope: 'PERSONAL' }), CONTEXT);
    const result = await registry.execute(
      call('propose_settings', { controlScope: 'BOTH', pjLimitControlEnabled: true }),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    const state = await onboardingService.getState(TENANT_ID);
    expect(state.draft.settings?.payload.controlScope).toBe('BOTH');
  });

  it('update_draft_item e remove_draft_item operam por draftItemId', async () => {
    await registry.execute(call('propose_account', { name: 'Conta' }), CONTEXT);
    const updated = await registry.execute(
      call('update_draft_item', { draftItemId: 'acc_1', payload: { isMain: true } }),
      CONTEXT,
    );
    expect(updated.ok).toBe(true);
    expect((updated.output as { payload: { isMain: boolean } }).payload.isMain).toBe(true);

    const removed = await registry.execute(
      call('remove_draft_item', { draftItemId: 'acc_1' }),
      CONTEXT,
    );
    expect(removed.ok).toBe(true);
    const state = await onboardingService.getState(TENANT_ID);
    expect(state.draft.accounts).toHaveLength(0);
  });

  it('present_setup_summary transiciona IN_PROGRESS → AWAITING_CONFIRMATION e é idempotente', async () => {
    await onboardingService.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
    const first = await registry.execute(call('present_setup_summary'), CONTEXT);
    expect(first.ok).toBe(true);
    expect((first.output as { status: string }).status).toBe(
      OnboardingStatus.AWAITING_CONFIRMATION,
    );

    const second = await registry.execute(call('present_setup_summary'), CONTEXT);
    expect(second.ok).toBe(true);
    expect((second.output as { status: string }).status).toBe(
      OnboardingStatus.AWAITING_CONFIRMATION,
    );
  });

  it('present_setup_summary reporta pendências restantes', async () => {
    await onboardingService.transition(TENANT_ID, OnboardingStatus.IN_PROGRESS);
    await registry.execute(call('propose_account', { name: 'Conta' }), CONTEXT);
    const result = await registry.execute(call('present_setup_summary'), CONTEXT);
    const output = result.output as { pendencies: string[] };
    expect(output.pendencies).toContain('noMainAccount');
    expect(output.pendencies).toContain('noSettings');
    expect(output.pendencies).not.toContain('noAccounts');
  });

  it('nenhuma tool grava em coleções financeiras', async () => {
    await registry.execute(
      call('propose_account', { name: 'Conta', accountTypeName: 'Corrente', isMain: true }),
      CONTEXT,
    );
    await registry.execute(
      call('propose_income', {
        description: 'Renda',
        grossAmount: 100000,
        dayOfMonth: 5,
        categoryName: 'Renda',
      }),
      CONTEXT,
    );
    await registry.execute(call('propose_settings', { controlScope: 'PERSONAL' }), CONTEXT);
    expect(accountsRepo.items).toHaveLength(0);
    expect(categoriesRepo.items).toHaveLength(0);
  });
});
