import { z } from 'zod';
import { AiToolRegistry } from '../ai/tool-registry';
import { AiToolContext } from '../ai/ai-tool.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';
import { OnboardingService } from './onboarding.service';
import { OnboardingDraftService } from './onboarding-draft.service';
import {
  draftAccountPayloadSchema,
  draftCreditCardPayloadSchema,
  draftExpensePayloadSchema,
  draftIncomePayloadSchema,
  draftSettingsPayloadSchema,
  draftTransferPayloadSchema,
} from './onboarding.schemas';
import { OnboardingDraft, OnboardingDraftItem, OnboardingStatus } from './onboarding.types';

// Tools do onboarding (ADR 0003): leitura de contexto autorizado e propostas
// que alteram SOMENTE o draft. Nenhuma tool toca coleções financeiras — a
// escrita real acontece apenas na confirmação explícita (ADR 0004).
//
// propose_account_type e propose_category não existem como tools: o modelo
// informa accountTypeName/categoryName e a resolução (reusar item do draft com
// o mesmo nome ou criar um novo) é interna — menos refs para o modelo
// administrar e menos superfícies de erro.

export interface OnboardingToolsDeps {
  onboardingService: OnboardingService;
  draftService: OnboardingDraftService;
  accountsRepo: AccountsRepository;
  categoriesRepo: CategoriesRepository;
}

// ─── Schemas de entrada das tools ───────────────────────────────────────────────

const nameSchema = z.string().min(1).max(80);

const proposeAccountInputSchema = draftAccountPayloadSchema
  .omit({ accountTypeRef: true })
  .extend({
    accountTypeName: nameSchema.optional(),
  });

const proposeIncomeInputSchema = draftIncomePayloadSchema
  .omit({ incomeCategoryRef: true })
  .extend({
    categoryName: nameSchema,
  });

const proposeExpenseInputSchema = draftExpensePayloadSchema
  .omit({ categoryRef: true })
  .extend({
    categoryName: nameSchema,
  });

const draftItemIdSchema = z.string().min(1).max(40);

const updateDraftItemInputSchema = z.object({
  draftItemId: draftItemIdSchema,
  payload: z.record(z.unknown()),
});

const removeDraftItemInputSchema = z.object({
  draftItemId: draftItemIdSchema,
});

const emptyInputSchema = z.object({});

// ─── Registry ───────────────────────────────────────────────────────────────────

export function createOnboardingToolRegistry(deps: OnboardingToolsDeps): AiToolRegistry {
  const { onboardingService, draftService, accountsRepo, categoriesRepo } = deps;
  const registry = new AiToolRegistry();

  /** Reusa item do draft com o mesmo nome (case-insensitive) ou cria um novo. */
  async function resolveAccountTypeRef(tenantId: string, name: string): Promise<string> {
    const state = await onboardingService.getState(tenantId);
    const existing = findByName(state.draft.accountTypes, name);
    if (existing) return existing.draftItemId;
    const result = await draftService.addItem(tenantId, 'accountTypes', { name }, 'ai');
    return result.item.draftItemId;
  }

  async function resolveCategoryRef(
    tenantId: string,
    name: string,
    type: CategoryType,
  ): Promise<string> {
    const state = await onboardingService.getState(tenantId);
    const existing = findByName(state.draft.categories, name);
    // Nome igual com tipo diferente cai na validação de nome duplicado do
    // draft ao tentar criar — o modelo recebe o erro e renomeia.
    if (existing && (existing.payload as { type?: string }).type === type) {
      return existing.draftItemId;
    }
    const result = await draftService.addItem(tenantId, 'categories', { name, type }, 'ai');
    return result.item.draftItemId;
  }

  registry.register({
    name: 'get_onboarding_context',
    description:
      'Retorna o estado atual do onboarding: status, draft com todos os itens propostos ' +
      '(e seus draftItemIds), pendências e nomes de contas/categorias já existentes. ' +
      'Use para saber o que já foi coletado antes de perguntar ou propor.',
    kind: 'read',
    inputSchema: emptyInputSchema,
    execute: async (_input, context) => {
      const state = await onboardingService.getState(context.tenantId);
      const [accounts, categories] = await Promise.all([
        accountsRepo.findAll(context.tenantId),
        categoriesRepo.findAll(context.tenantId),
      ]);
      return {
        status: state.status,
        draft: compactDraft(state.draft),
        pendencies: computePendencies(state.draft),
        // Somente nomes: UUIDs reais não são refs válidas no draft e não
        // devem circular pelo modelo.
        existingAccounts: accounts.map((a) => a.name),
        existingCategories: categories.map((c) => ({ name: c.name, type: c.type })),
      };
    },
  });

  registry.register({
    name: 'propose_account',
    description:
      'Propõe uma conta bancária no draft. Use accountTypeName para o tipo (ex.: "Conta corrente"); ' +
      'isMain marca a conta principal (apenas uma). Reserva automática: autoReserveEnabled + ' +
      'autoReservePercentage + autoReserveTargetAccountRef ficam na conta de ORIGEM e apontam para ' +
      'a conta de DESTINO (outro draftItemId, nunca a própria conta) — ao registrar/receber uma ' +
      'entrada na origem, o percentual é transferido automaticamente para o destino. isMain e a ' +
      'reserva automática não conflitam: uma conta pode ser principal e ter uma regra de reserva ' +
      'ao mesmo tempo. Se a conta de destino ainda não existir no draft, proponha-a primeiro. ' +
      'Valores em centavos inteiros.',
    kind: 'proposal',
    inputSchema: proposeAccountInputSchema,
    execute: async (input, context) => {
      const { accountTypeName, ...payload } = input;
      const accountTypeRef = accountTypeName
        ? await resolveAccountTypeRef(context.tenantId, accountTypeName)
        : null;
      const result = await draftService.addItem(
        context.tenantId,
        'accounts',
        { ...payload, accountTypeRef },
        'ai',
      );
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'propose_income',
    description:
      'Propõe uma receita no draft. categoryName é o nome da categoria de receita (criada se não existir); ' +
      'grossAmount em centavos inteiros; dayOfMonth 1-28; recurrence FIXED para mensal, UNIQUE para única; ' +
      'targetAccountRef é a conta de destino (default: conta principal). Reserva automática não se ' +
      'configura aqui — é uma regra por conta, veja propose_account.',
    kind: 'proposal',
    inputSchema: proposeIncomeInputSchema,
    execute: async (input, context) => {
      const { categoryName, ...payload } = input;
      const incomeCategoryRef = await resolveCategoryRef(
        context.tenantId,
        categoryName,
        CategoryType.INCOME,
      );
      const result = await draftService.addItem(
        context.tenantId,
        'incomes',
        { ...payload, incomeCategoryRef },
        'ai',
      );
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'propose_expense',
    description:
      'Propõe uma despesa no draft. categoryName é o nome da categoria de despesa (criada se não existir); ' +
      'amount em centavos inteiros; dayOfMonth 1-28; recurrence FIXED para fixa mensal, UNIQUE para única; ' +
      'sourceAccountRef é o draftItemId da conta pagadora (opcional, default conta principal).',
    kind: 'proposal',
    inputSchema: proposeExpenseInputSchema,
    execute: async (input, context) => {
      const { categoryName, ...payload } = input;
      const categoryRef = await resolveCategoryRef(
        context.tenantId,
        categoryName,
        CategoryType.EXPENSE,
      );
      const result = await draftService.addItem(
        context.tenantId,
        'expenses',
        { ...payload, categoryRef },
        'ai',
      );
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'propose_credit_card',
    description:
      'Propõe um cartão de crédito no draft. closingDay/dueDay 1-28; limit em centavos inteiros; ' +
      'defaultPaymentAccountRef é o draftItemId da conta que paga a fatura; se omitido, a conta principal paga.',
    kind: 'proposal',
    inputSchema: draftCreditCardPayloadSchema,
    execute: async (input, context) => {
      const result = await draftService.addItem(context.tenantId, 'creditCards', input, 'ai');
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'propose_settings',
    description:
      'Propõe as configurações financeiras (singleton; nova proposta substitui a anterior). ' +
      'dashboardScope define só a visão inicial do seletor de conta (Início, Movimentações, Cartões): ' +
      'CONSOLIDATED abre em "Todas as contas"; ACCOUNT abre numa conta por vez (útil para ver PF e PJ separados). ' +
      'O usuário troca a qualquer momento no seletor. Só proponha se ele tiver mais de uma conta e demonstrar ' +
      'preferência — CONSOLIDATED já é o default.',
    kind: 'proposal',
    inputSchema: draftSettingsPayloadSchema,
    execute: async (input, context) => {
      const result = await draftService.addItem(context.tenantId, 'settings', input, 'ai');
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'propose_transfer',
    description:
      'Propõe uma transferência pontual entre duas contas do draft (já feita ou já decidida pelo ' +
      'usuário) — não é a regra de reserva automática recorrente (para isso use propose_account). ' +
      'sourceAccountRef/targetAccountRef são draftItemIds de contas diferentes; amount em centavos ' +
      'inteiros; dayOfMonth 1-28.',
    kind: 'proposal',
    inputSchema: draftTransferPayloadSchema,
    execute: async (input, context) => {
      const result = await draftService.addItem(context.tenantId, 'transfers', input, 'ai');
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'update_draft_item',
    description:
      'Atualiza um item existente do draft por draftItemId. payload é um patch parcial; ' +
      'o item resultante é revalidado por inteiro.',
    kind: 'proposal',
    inputSchema: updateDraftItemInputSchema,
    execute: async (input, context) => {
      const result = await draftService.updateItem(
        context.tenantId,
        input.draftItemId,
        input.payload,
        'ai',
      );
      return proposalOutput(result.item, result.state.draft);
    },
  });

  registry.register({
    name: 'remove_draft_item',
    description:
      'Remove um item do draft por draftItemId. Falha se outro item o referencia ' +
      '(remova ou atualize os dependentes antes).',
    kind: 'proposal',
    inputSchema: removeDraftItemInputSchema,
    execute: async (input, context) => {
      const state = await draftService.removeItem(context.tenantId, input.draftItemId);
      return { removed: input.draftItemId, draft: compactDraft(state.draft) };
    },
  });

  registry.register({
    name: 'present_setup_summary',
    description:
      'Sinaliza que a coleta terminou e o resumo deve ser apresentado ao usuário para revisão. ' +
      'Chame quando o draft estiver completo (sem pendências relevantes). ' +
      'Retorna o draft final e as pendências restantes.',
    kind: 'proposal',
    inputSchema: emptyInputSchema,
    execute: async (_input, context) => {
      let state = await onboardingService.getState(context.tenantId);
      // Idempotente: repetir a chamada com o resumo já apresentado não é erro.
      if (state.status === OnboardingStatus.IN_PROGRESS) {
        state = await onboardingService.transition(
          context.tenantId,
          OnboardingStatus.AWAITING_CONFIRMATION,
        );
      } else if (state.status !== OnboardingStatus.AWAITING_CONFIRMATION) {
        // PENDING/finais: transição inválida — deixa o erro padrão subir.
        state = await onboardingService.transition(
          context.tenantId,
          OnboardingStatus.AWAITING_CONFIRMATION,
        );
      }
      return {
        status: state.status,
        draft: compactDraft(state.draft),
        pendencies: computePendencies(state.draft),
      };
    },
  });

  return registry;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function findByName(
  items: OnboardingDraftItem[],
  name: string,
): OnboardingDraftItem | undefined {
  const needle = name.trim().toLowerCase();
  return items.find(
    (i) => String((i.payload as { name?: unknown }).name ?? '').trim().toLowerCase() === needle,
  );
}

/** Visão compacta do draft para o modelo: draftItemId + payload por seção. */
export function compactDraft(draft: OnboardingDraft) {
  const view = (items: OnboardingDraftItem[]) =>
    items.map((i) => ({ draftItemId: i.draftItemId, ...i.payload }));
  return {
    accountTypes: view(draft.accountTypes),
    accounts: view(draft.accounts),
    categories: view(draft.categories),
    incomes: view(draft.incomes),
    expenses: view(draft.expenses),
    creditCards: view(draft.creditCards),
    transfers: view(draft.transfers),
    settings: draft.settings
      ? { draftItemId: draft.settings.draftItemId, ...draft.settings.payload }
      : null,
  };
}

/** Lacunas que o assistente deve tentar cobrir antes de apresentar o resumo. */
export function computePendencies(draft: OnboardingDraft): string[] {
  const pendencies: string[] = [];
  if (draft.accounts.length === 0) pendencies.push('noAccounts');
  if (!draft.accounts.some((a) => (a.payload as { isMain?: boolean }).isMain)) {
    pendencies.push('noMainAccount');
  }
  if (draft.incomes.length === 0) pendencies.push('noIncomes');
  if (!draft.settings) pendencies.push('noSettings');
  return pendencies;
}

function proposalOutput(item: OnboardingDraftItem, draft: OnboardingDraft) {
  return {
    draftItemId: item.draftItemId,
    payload: item.payload,
    pendencies: computePendencies(draft),
  };
}
