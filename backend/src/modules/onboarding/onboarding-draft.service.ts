import { ZodSchema } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { nowISO } from '../../shared/utils/date.utils';
import { OnboardingService } from './onboarding.service';
import { OnboardingStateRepository } from './onboarding.repository';
import {
  OnboardingDraft,
  OnboardingDraftItem,
  OnboardingDraftSource,
  OnboardingState,
  OnboardingStatus,
} from './onboarding.types';
import {
  DraftAccountPayload,
  DraftCreditCardPayload,
  DraftExpensePayload,
  DraftIncomePayload,
  DraftTransferPayload,
  OnboardingDraftSection,
  draftAccountPayloadSchema,
  draftAccountTypePayloadSchema,
  draftCategoryPayloadSchema,
  draftCreditCardPayloadSchema,
  draftExpensePayloadSchema,
  draftIncomePayloadSchema,
  draftSettingsPayloadSchema,
  draftTransferPayloadSchema,
} from './onboarding.schemas';
import { CategoryType } from '../categories/categories.types';

// O draft só pode ser alterado enquanto o onboarding não terminou.
const EDITABLE_STATUSES: OnboardingStatus[] = [
  OnboardingStatus.PENDING,
  OnboardingStatus.IN_PROGRESS,
  OnboardingStatus.AWAITING_CONFIRMATION,
];

const SECTION_SCHEMAS: Record<OnboardingDraftSection, ZodSchema> = {
  accountTypes: draftAccountTypePayloadSchema,
  accounts: draftAccountPayloadSchema,
  categories: draftCategoryPayloadSchema,
  incomes: draftIncomePayloadSchema,
  expenses: draftExpensePayloadSchema,
  creditCards: draftCreditCardPayloadSchema,
  transfers: draftTransferPayloadSchema,
  settings: draftSettingsPayloadSchema,
};

// Prefixo do draftItemId por seção. O id resultante ('acc_1', 'cat_2'...) é a
// ref simbólica usada entre itens e o identificador estável da idempotência
// (ADR 0005). Números não são reutilizados após remoção.
const SECTION_ID_PREFIX: Record<OnboardingDraftSection, string> = {
  accountTypes: 'atype',
  accounts: 'acc',
  categories: 'cat',
  incomes: 'inc',
  expenses: 'exp',
  creditCards: 'card',
  transfers: 'transfer',
  settings: 'settings',
};

// Seções cujos itens têm nome único (case-insensitive) dentro do draft.
const UNIQUE_NAME_SECTIONS: OnboardingDraftSection[] = [
  'accountTypes',
  'accounts',
  'categories',
  'creditCards',
];

const LIST_SECTIONS = [
  'accountTypes',
  'accounts',
  'categories',
  'incomes',
  'expenses',
  'creditCards',
  'transfers',
] as const;

export interface DraftMutationResult {
  state: OnboardingState;
  item: OnboardingDraftItem;
}

export class OnboardingDraftService {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly stateRepo: OnboardingStateRepository,
  ) {}

  async addItem(
    tenantId: string,
    section: OnboardingDraftSection,
    payload: Record<string, unknown>,
    source: OnboardingDraftSource,
  ): Promise<DraftMutationResult> {
    const state = await this.getEditableState(tenantId);
    const parsed = SECTION_SCHEMAS[section].parse(payload) as Record<string, unknown>;
    const now = nowISO();

    const draft = cloneDraft(state.draft);
    const item: OnboardingDraftItem = {
      draftItemId: this.nextItemId(draft, section),
      source,
      payload: parsed,
      createdAt: now,
      updatedAt: now,
    };

    if (section === 'settings') {
      // Singleton: propor settings de novo substitui a proposta anterior.
      item.draftItemId = SECTION_ID_PREFIX.settings;
      draft.settings = draft.settings
        ? { ...item, createdAt: draft.settings.createdAt }
        : item;
    } else {
      draft[section].push(item);
    }

    this.validateDraft(draft);
    const updated = await this.saveDraft(state, draft);
    return { state: updated, item };
  }

  async updateItem(
    tenantId: string,
    draftItemId: string,
    payloadPatch: Record<string, unknown>,
    source: OnboardingDraftSource,
  ): Promise<DraftMutationResult> {
    const state = await this.getEditableState(tenantId);
    const draft = cloneDraft(state.draft);
    const found = this.findItem(draft, draftItemId);
    if (!found) {
      throw new AppError(
        `Item ${draftItemId} não encontrado no draft`,
        404,
        'onboarding.draft.itemNotFound',
        { draftItemId },
      );
    }

    // O patch é mesclado ao payload atual e o resultado revalidado pelo schema
    // completo da seção — campos desconhecidos do patch são descartados pelo parse.
    const merged = { ...found.item.payload, ...payloadPatch };
    found.item.payload = SECTION_SCHEMAS[found.section].parse(merged) as Record<string, unknown>;
    found.item.updatedAt = nowISO();
    found.item.source = source;

    this.validateDraft(draft);
    const updated = await this.saveDraft(state, draft);
    return { state: updated, item: found.item };
  }

  async removeItem(tenantId: string, draftItemId: string): Promise<OnboardingState> {
    const state = await this.getEditableState(tenantId);
    const draft = cloneDraft(state.draft);
    const found = this.findItem(draft, draftItemId);
    if (!found) {
      throw new AppError(
        `Item ${draftItemId} não encontrado no draft`,
        404,
        'onboarding.draft.itemNotFound',
        { draftItemId },
      );
    }

    const referencedBy = this.findReferences(draft, draftItemId);
    if (referencedBy.length > 0) {
      throw new AppError(
        `Item ${draftItemId} é referenciado por ${referencedBy.join(', ')}`,
        409,
        'onboarding.draft.refInUse',
        { draftItemId, referencedBy: referencedBy.join(', ') },
      );
    }

    if (found.section === 'settings') {
      draft.settings = null;
    } else {
      draft[found.section] = draft[found.section].filter((i) => i.draftItemId !== draftItemId);
    }

    this.validateDraft(draft);
    return this.saveDraft(state, draft);
  }

  // ─── Internos ────────────────────────────────────────────────────────────────

  private async getEditableState(tenantId: string): Promise<OnboardingState> {
    const state = await this.onboardingService.getState(tenantId);
    if (!EDITABLE_STATUSES.includes(state.status)) {
      throw new AppError(
        `Draft não pode ser alterado com status ${state.status}`,
        409,
        'onboarding.draft.locked',
        { status: state.status },
      );
    }
    return state;
  }

  private async saveDraft(state: OnboardingState, draft: OnboardingDraft): Promise<OnboardingState> {
    return this.stateRepo.upsert({ ...state, draft, updatedAt: nowISO() });
  }

  private nextItemId(draft: OnboardingDraft, section: OnboardingDraftSection): string {
    const prefix = SECTION_ID_PREFIX[section];
    if (section === 'settings') return prefix;
    // Considera também o máximo entre os itens atuais para drafts criados
    // antes da introdução dos contadores.
    const maxExisting = draft[section].reduce((acc, item) => {
      const match = item.draftItemId.match(new RegExp(`^${prefix}_(\\d+)$`));
      return match ? Math.max(acc, Number(match[1])) : acc;
    }, 0);
    const next = Math.max(draft.itemCounters?.[section] ?? 0, maxExisting) + 1;
    draft.itemCounters = { ...(draft.itemCounters ?? {}), [section]: next };
    return `${prefix}_${next}`;
  }

  private findItem(
    draft: OnboardingDraft,
    draftItemId: string,
  ): { section: OnboardingDraftSection; item: OnboardingDraftItem } | null {
    for (const section of LIST_SECTIONS) {
      const item = draft[section].find((i) => i.draftItemId === draftItemId);
      if (item) return { section, item };
    }
    if (draft.settings?.draftItemId === draftItemId) {
      return { section: 'settings', item: draft.settings };
    }
    return null;
  }

  /** draftItemIds que referenciam o item informado (bloqueia remoção). */
  private findReferences(draft: OnboardingDraft, draftItemId: string): string[] {
    const refs: string[] = [];
    for (const account of draft.accounts) {
      const p = account.payload as unknown as DraftAccountPayload;
      if (p.accountTypeRef === draftItemId) refs.push(account.draftItemId);
      if (p.autoReserveTargetAccountRef === draftItemId) refs.push(account.draftItemId);
    }
    for (const income of draft.incomes) {
      const p = income.payload as unknown as DraftIncomePayload;
      if (p.incomeCategoryRef === draftItemId || p.targetAccountRef === draftItemId) {
        refs.push(income.draftItemId);
      }
    }
    for (const expense of draft.expenses) {
      const p = expense.payload as unknown as DraftExpensePayload;
      if (p.categoryRef === draftItemId || p.sourceAccountRef === draftItemId) {
        refs.push(expense.draftItemId);
      }
    }
    for (const card of draft.creditCards) {
      const p = card.payload as unknown as DraftCreditCardPayload;
      if (p.defaultPaymentAccountRef === draftItemId) refs.push(card.draftItemId);
    }
    for (const transfer of draft.transfers) {
      const p = transfer.payload as unknown as DraftTransferPayload;
      if (p.sourceAccountRef === draftItemId || p.targetAccountRef === draftItemId) {
        refs.push(transfer.draftItemId);
      }
    }
    return refs;
  }

  /** Validações cruzadas do draft inteiro; roda após toda mutação. */
  private validateDraft(draft: OnboardingDraft): void {
    this.validateUniqueNames(draft);
    this.validateSingleMainAccount(draft);
    this.validateAutoReserveRule(draft);
    this.validateRefs(draft);
  }

  private validateUniqueNames(draft: OnboardingDraft): void {
    for (const section of UNIQUE_NAME_SECTIONS) {
      const seen = new Map<string, string>();
      for (const item of draft[section as (typeof LIST_SECTIONS)[number]]) {
        const name = String((item.payload as { name?: unknown }).name ?? '')
          .trim()
          .toLowerCase();
        if (seen.has(name)) {
          throw new AppError(
            `Nome duplicado na seção ${section}: ${name}`,
            409,
            'onboarding.draft.duplicateName',
            { section, name },
          );
        }
        seen.set(name, item.draftItemId);
      }
    }
  }

  private validateSingleMainAccount(draft: OnboardingDraft): void {
    const mains = draft.accounts.filter(
      (a) => (a.payload as unknown as DraftAccountPayload).isMain,
    );
    if (mains.length > 1) {
      throw new AppError(
        'Mais de uma conta marcada como principal no draft',
        409,
        'onboarding.draft.mainAccountDuplicate',
        { accounts: mains.map((a) => a.draftItemId).join(', ') },
      );
    }
  }

  /**
   * Reserva automática (E8): a conta de ORIGEM (autoReserveEnabled) precisa
   * apontar para uma conta de DESTINO diferente de si mesma. isMain não
   * participa mais dessa regra — uma conta pode ser principal e ter uma
   * regra de reserva ao mesmo tempo, desde que o destino seja outra conta.
   * Sem essa checagem, um draft assim passa pela revisão e só quebra na
   * confirmação (accountsService.update já valida o mesmo caso para contas
   * reais), deixando o onboarding travado sem saída pela UI.
   */
  private validateAutoReserveRule(draft: OnboardingDraft): void {
    for (const account of draft.accounts) {
      const p = account.payload as unknown as DraftAccountPayload;
      if (!p.autoReserveEnabled) continue;
      if (!p.autoReserveTargetAccountRef) {
        throw new AppError(
          'Conta de reserva automática precisa de uma conta de destino',
          409,
          'onboarding.draft.autoReserveTargetRequired',
          { accountId: account.draftItemId },
        );
      }
      if (p.autoReserveTargetAccountRef === account.draftItemId) {
        throw new AppError(
          'A conta de origem e destino da reserva automática devem ser diferentes',
          409,
          'onboarding.draft.autoReserveSameAccount',
          { accountId: account.draftItemId },
        );
      }
    }
  }

  private validateRefs(draft: OnboardingDraft): void {
    const accountIds = new Set(draft.accounts.map((a) => a.draftItemId));
    const accountTypeIds = new Set(draft.accountTypes.map((t) => t.draftItemId));
    const categoriesById = new Map(
      draft.categories.map((c) => [c.draftItemId, (c.payload as { type: CategoryType }).type]),
    );

    const assertRef = (ref: string, valid: boolean, owner: string) => {
      if (!valid) {
        throw new AppError(
          `Ref inválida "${ref}" em ${owner}`,
          400,
          'onboarding.draft.invalidRef',
          { ref, owner },
        );
      }
    };

    for (const account of draft.accounts) {
      const p = account.payload as unknown as DraftAccountPayload;
      if (p.accountTypeRef) {
        assertRef(p.accountTypeRef, accountTypeIds.has(p.accountTypeRef), account.draftItemId);
      }
      if (p.autoReserveTargetAccountRef) {
        assertRef(
          p.autoReserveTargetAccountRef,
          accountIds.has(p.autoReserveTargetAccountRef),
          account.draftItemId,
        );
      }
    }
    for (const income of draft.incomes) {
      const p = income.payload as unknown as DraftIncomePayload;
      assertRef(
        p.incomeCategoryRef,
        categoriesById.get(p.incomeCategoryRef) === CategoryType.INCOME,
        income.draftItemId,
      );
      if (p.targetAccountRef) {
        assertRef(p.targetAccountRef, accountIds.has(p.targetAccountRef), income.draftItemId);
      }
    }
    for (const expense of draft.expenses) {
      const p = expense.payload as unknown as DraftExpensePayload;
      assertRef(
        p.categoryRef,
        categoriesById.get(p.categoryRef) === CategoryType.EXPENSE,
        expense.draftItemId,
      );
      if (p.sourceAccountRef) {
        assertRef(p.sourceAccountRef, accountIds.has(p.sourceAccountRef), expense.draftItemId);
      }
    }
    for (const card of draft.creditCards) {
      const p = card.payload as unknown as DraftCreditCardPayload;
      if (p.defaultPaymentAccountRef) {
        assertRef(
          p.defaultPaymentAccountRef,
          accountIds.has(p.defaultPaymentAccountRef),
          card.draftItemId,
        );
      }
    }
    for (const transfer of draft.transfers) {
      const p = transfer.payload as unknown as DraftTransferPayload;
      assertRef(p.sourceAccountRef, accountIds.has(p.sourceAccountRef), transfer.draftItemId);
      assertRef(p.targetAccountRef, accountIds.has(p.targetAccountRef), transfer.draftItemId);
    }
  }
}

function cloneDraft(draft: OnboardingDraft): OnboardingDraft {
  return structuredClone(draft);
}
