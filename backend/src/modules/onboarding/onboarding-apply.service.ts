import { AppError } from '../../shared/errors/app-error';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from '../accounts/accounts.repository';
import { AccountsService } from '../accounts/accounts.service';
import { AccountTypesRepository } from '../account-types/account-types.repository';
import { AccountTypesService } from '../account-types/account-types.service';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoriesService } from '../categories/categories.service';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import { SettingsService } from '../settings/settings.service';
import { OnboardingService } from './onboarding.service';
import { OnboardingStateRepository } from './onboarding.repository';
import {
  DraftAccountPayload,
  DraftAccountTypePayload,
  DraftCategoryPayload,
  DraftCreditCardPayload,
  DraftExpensePayload,
  DraftIncomePayload,
  DraftSettingsPayload,
} from './onboarding.schemas';
import {
  OnboardingDraftItem,
  OnboardingState,
  OnboardingStatus,
} from './onboarding.types';

// Aplica o draft confirmado usando EXCLUSIVAMENTE os services existentes
// (ADR 0004) de forma idempotente e retomável (ADR 0005):
// - appliedEntityIds (draftItemId → id real) é persistido após CADA criação;
//   reexecutar após falha parcial completa apenas o que falta;
// - entidades existentes com o mesmo nome são reusadas, nunca duplicadas
//   (cobre p.ex. a categoria protegida "Nota Fiscal" criada pelo Settings);
// - mesma idempotencyKey após conclusão devolve o resultado anterior;
// - lock em memória impede confirmação concorrente do mesmo tenant
//   (processo único — risco documentado em ai-security.md).

export interface OnboardingApplyServices {
  accountTypesService: AccountTypesService;
  accountsService: AccountsService;
  categoriesService: CategoriesService;
  settingsService: SettingsService;
  creditCardsService: CreditCardsService;
  cashFlowService: CashFlowService;
  // Repositórios só para leitura (reuso por nome); escrita passa pelos services.
  accountTypesRepo: AccountTypesRepository;
  accountsRepo: AccountsRepository;
  categoriesRepo: CategoriesRepository;
  creditCardsRepo: CreditCardsRepository;
}

export interface ConfirmResult {
  status: OnboardingStatus;
  appliedEntityIds: Record<string, string>;
  alreadyApplied: boolean;
}

export class OnboardingApplyService {
  private readonly applying = new Set<string>();

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly stateRepo: OnboardingStateRepository,
    private readonly services: OnboardingApplyServices,
  ) {}

  async confirm(tenantId: string, idempotencyKey: string): Promise<ConfirmResult> {
    if (this.applying.has(tenantId)) {
      throw new AppError(
        'Confirmação já em andamento para este tenant',
        409,
        'onboarding.confirm.inProgress',
      );
    }
    this.applying.add(tenantId);
    try {
      return await this.doConfirm(tenantId, idempotencyKey);
    } finally {
      this.applying.delete(tenantId);
    }
  }

  private async doConfirm(tenantId: string, idempotencyKey: string): Promise<ConfirmResult> {
    let state = await this.onboardingService.getState(tenantId);

    if (state.status === OnboardingStatus.COMPLETED) {
      if (state.confirmIdempotencyKey === idempotencyKey) {
        // Replay idempotente da mesma confirmação (ex.: retry de rede).
        return {
          status: state.status,
          appliedEntityIds: state.appliedEntityIds,
          alreadyApplied: true,
        };
      }
      throw new AppError(
        'Onboarding já concluído',
        409,
        'onboarding.confirm.alreadyCompleted',
      );
    }

    if (state.status !== OnboardingStatus.AWAITING_CONFIRMATION) {
      throw new AppError(
        `Confirmação indisponível com status ${state.status}`,
        409,
        'onboarding.confirm.invalidState',
        { status: state.status },
      );
    }

    this.validateForApply(state);

    // Registra a chave da tentativa atual antes de aplicar.
    state = await this.stateRepo.upsert({
      ...state,
      confirmIdempotencyKey: idempotencyKey,
      updatedAt: nowISO(),
    });

    const applied = { ...state.appliedEntityIds };
    const record = async (draftItemId: string, entityId: string) => {
      applied[draftItemId] = entityId;
      // Persistido a cada passo: uma falha adiante não perde o progresso.
      state = await this.stateRepo.upsert({
        ...state,
        appliedEntityIds: applied,
        updatedAt: nowISO(),
      });
    };
    const resolve = (ref: string | null | undefined): string | null => {
      if (!ref) return null;
      const id = applied[ref];
      if (!id) {
        throw new AppError(`Ref não aplicada: ${ref}`, 400, 'onboarding.draft.invalidRef', {
          ref,
        });
      }
      return id;
    };

    const draft = state.draft;

    // 1. Tipos de conta
    for (const item of draft.accountTypes) {
      if (applied[item.draftItemId]) continue;
      const payload = item.payload as unknown as DraftAccountTypePayload;
      const existing = await this.findExistingAccountTypeByName(tenantId, payload.name);
      const id = existing ?? (await this.services.accountTypesService.create(tenantId, payload)).id;
      await record(item.draftItemId, id);
    }

    // 2. Contas
    let mainAccountId: string | null = null;
    for (const item of draft.accounts) {
      const payload = item.payload as unknown as DraftAccountPayload;
      if (!applied[item.draftItemId]) {
        const existing = await this.findExistingAccountByName(tenantId, payload.name);
        const id =
          existing ??
          (
            await this.services.accountsService.create(tenantId, {
              name: payload.name,
              accountTypeId: resolve(payload.accountTypeRef),
              initialBalance: payload.initialBalance,
              autoReserveEnabled: payload.autoReserveEnabled,
              autoReservePercentage: payload.autoReservePercentage,
            })
          ).id;
        await record(item.draftItemId, id);
      }
      if (payload.isMain) mainAccountId = applied[item.draftItemId];
    }

    // 3. Categorias
    for (const item of draft.categories) {
      if (applied[item.draftItemId]) continue;
      const payload = item.payload as unknown as DraftCategoryPayload;
      const existing = await this.findExistingCategoryByName(tenantId, payload.name);
      const id = existing ?? (await this.services.categoriesService.create(tenantId, payload)).id;
      await record(item.draftItemId, id);
    }

    // 4. Configurações (singleton; update é naturalmente idempotente)
    if (draft.settings && !applied[draft.settings.draftItemId]) {
      const payload = draft.settings.payload as unknown as DraftSettingsPayload;
      const settings = await this.services.settingsService.update(tenantId, {
        mainAccountId,
        minimumMainBalance: payload.minimumMainBalance,
        annualRevenueLimit: payload.annualRevenueLimit,
        pjLimitControlEnabled: payload.pjLimitControlEnabled,
      });
      await record(draft.settings.draftItemId, settings.id);
    } else if (!draft.settings && mainAccountId) {
      // Sem proposta de settings, mas a conta principal precisa ser registrada.
      await this.services.settingsService.update(tenantId, { mainAccountId });
    }

    // 5. Cartões de crédito
    for (const item of draft.creditCards) {
      if (applied[item.draftItemId]) continue;
      const payload = item.payload as unknown as DraftCreditCardPayload;
      const existing = await this.findExistingCardByName(tenantId, payload.name);
      const id =
        existing ??
        (
          await this.services.creditCardsService.create(tenantId, {
            name: payload.name,
            bank: payload.bank,
            closingDay: payload.closingDay,
            dueDay: payload.dueDay,
            limit: payload.limit,
            defaultPaymentAccountId: resolve(payload.defaultPaymentAccountRef),
          })
        ).id;
      await record(item.draftItemId, id);
    }

    // 6. Receitas
    for (const item of draft.incomes) {
      if (applied[item.draftItemId]) continue;
      const payload = item.payload as unknown as DraftIncomePayload;
      const income = await this.services.cashFlowService.createIncome(tenantId, {
        description: payload.description,
        categoryId: resolve(payload.incomeCategoryRef) as string,
        amount: payload.grossAmount,
        expectedDate: anchorDate(payload.dayOfMonth),
        targetAccountId: resolve(payload.targetAccountRef),
        recurrence: payload.recurrence,
      });
      await record(item.draftItemId, income.id);
    }

    // 7. Despesas
    for (const item of draft.expenses) {
      if (applied[item.draftItemId]) continue;
      const payload = item.payload as unknown as DraftExpensePayload;
      const transaction = await this.services.cashFlowService.createPayment(tenantId, {
        description: payload.description,
        categoryId: resolve(payload.categoryRef) as string,
        amount: payload.amount,
        expectedDate: anchorDate(payload.dayOfMonth),
        sourceAccountId: resolve(payload.sourceAccountRef),
        recurrence: payload.recurrence,
      });
      await record(item.draftItemId, transaction.id);
    }

    // Conclusão
    state = await this.stateRepo.upsert({
      ...(await this.onboardingService.transition(tenantId, OnboardingStatus.COMPLETED)),
      appliedEntityIds: applied,
      confirmIdempotencyKey: idempotencyKey,
      appliedAt: nowISO(),
      updatedAt: nowISO(),
    });

    return { status: state.status, appliedEntityIds: applied, alreadyApplied: false };
  }

  // ─── Validação final ─────────────────────────────────────────────────────────

  private validateForApply(state: OnboardingState): void {
    const draft = state.draft;
    if (draft.accounts.length === 0) {
      throw new AppError(
        'Draft sem contas — nada a aplicar',
        422,
        'onboarding.confirm.emptyDraft',
      );
    }
    const mains = draft.accounts.filter(
      (a) => (a.payload as unknown as DraftAccountPayload).isMain,
    );
    if (mains.length !== 1) {
      throw new AppError(
        'Draft precisa de exatamente uma conta principal',
        422,
        'onboarding.confirm.mainAccountRequired',
        { count: mains.length },
      );
    }
    // Defesa em profundidade: o draft service já bloqueia isMain +
    // autoReserveEnabled juntos a cada mutação, mas essa é a última barreira
    // antes de criar a conta de verdade — accountsService.create() não faz
    // essa checagem (só accountsService.update()), então deixar passar aqui
    // criaria a conta com reserva ativa e só quebraria depois, no
    // settingsService.update(mainAccountId), travando o onboarding sem saída.
    const mainAccountPayload = mains[0].payload as unknown as DraftAccountPayload;
    if (mainAccountPayload.autoReserveEnabled) {
      throw new AppError(
        'A conta principal não pode ser marcada como conta de reserva',
        422,
        'onboarding.draft.mainReserveConflict',
        { accountId: mains[0].draftItemId },
      );
    }
    // Refs resolvíveis dentro do draft (o draft service já garante em cada
    // mutação; revalidação defensiva antes de escrever dados reais).
    const ids = new Set<string>([
      ...draft.accountTypes.map((i) => i.draftItemId),
      ...draft.accounts.map((i) => i.draftItemId),
      ...draft.categories.map((i) => i.draftItemId),
    ]);
    const allRefs = (item: OnboardingDraftItem): (string | null | undefined)[] => {
      const p = item.payload as Record<string, unknown>;
      return [
        p.accountTypeRef as string | undefined,
        p.incomeCategoryRef as string | undefined,
        p.categoryRef as string | undefined,
        p.targetAccountRef as string | undefined,
        p.sourceAccountRef as string | undefined,
        p.defaultPaymentAccountRef as string | undefined,
        ...((p.reserveAccountRefs as string[] | undefined) ?? []),
      ];
    };
    for (const item of [
      ...draft.accounts,
      ...draft.incomes,
      ...draft.expenses,
      ...draft.creditCards,
    ]) {
      for (const ref of allRefs(item)) {
        if (ref && !ids.has(ref)) {
          throw new AppError(`Ref inválida "${ref}"`, 400, 'onboarding.draft.invalidRef', {
            ref,
            owner: item.draftItemId,
          });
        }
      }
    }
  }

  // ─── Reuso por nome (idempotência extra e convivência com dados existentes) ──

  private async findExistingAccountTypeByName(
    tenantId: string,
    name: string,
  ): Promise<string | null> {
    const all = await this.services.accountTypesRepo.findAll(tenantId);
    return all.find((t) => sameName(t.name, name))?.id ?? null;
  }

  private async findExistingAccountByName(tenantId: string, name: string): Promise<string | null> {
    const all = await this.services.accountsRepo.findAll(tenantId);
    return all.find((a) => sameName(a.name, name))?.id ?? null;
  }

  private async findExistingCategoryByName(
    tenantId: string,
    name: string,
  ): Promise<string | null> {
    const all = await this.services.categoriesRepo.findAll(tenantId);
    return all.find((c) => sameName(c.name, name))?.id ?? null;
  }

  private async findExistingCardByName(tenantId: string, name: string): Promise<string | null> {
    const all = await this.services.creditCardsRepo.findAll(tenantId);
    return all.find((c) => sameName(c.name, name))?.id ?? null;
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Primeira ocorrência no mês corrente (séries FIXED são materializadas pelos services). */
function anchorDate(dayOfMonth: number): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(dayOfMonth).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
