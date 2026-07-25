import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from '../accounts/accounts.repository';
import { TenantBootstrapService } from '../tenant-bootstrap/tenant-bootstrap.service';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import {
  createEmptyDraft,
  OnboardingDraft,
  OnboardingMessage,
  OnboardingState,
  OnboardingStatus,
} from './onboarding.types';

// Transições permitidas de status. Tudo que não está aqui é rejeitado com 409.
const ALLOWED_TRANSITIONS: Record<OnboardingStatus, OnboardingStatus[]> = {
  [OnboardingStatus.PENDING]: [
    OnboardingStatus.IN_PROGRESS,
    OnboardingStatus.SKIPPED,
    OnboardingStatus.COMPLETED_MANUAL,
  ],
  [OnboardingStatus.IN_PROGRESS]: [
    OnboardingStatus.AWAITING_CONFIRMATION,
    OnboardingStatus.SKIPPED,
    OnboardingStatus.COMPLETED_MANUAL,
  ],
  [OnboardingStatus.AWAITING_CONFIRMATION]: [
    // Voltar ao chat para ajustar é permitido.
    OnboardingStatus.IN_PROGRESS,
    OnboardingStatus.COMPLETED,
    OnboardingStatus.SKIPPED,
    OnboardingStatus.COMPLETED_MANUAL,
  ],
  // Quem dispensou o assistente ainda pode concluir manualmente.
  [OnboardingStatus.SKIPPED]: [OnboardingStatus.COMPLETED_MANUAL],
  [OnboardingStatus.COMPLETED]: [],
  [OnboardingStatus.COMPLETED_MANUAL]: [],
};

export class OnboardingService {
  constructor(
    private readonly stateRepo: OnboardingStateRepository,
    private readonly messagesRepo: OnboardingMessagesRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly tenantBootstrap: TenantBootstrapService,
  ) {}

  /**
   * Estado do tenant, criado sob demanda na primeira consulta.
   * Tenants que já possuem contas são considerados configurados
   * (COMPLETED_MANUAL retroativo) — o onboarding é só para tenants vazios.
   */
  async getState(tenantId: string): Promise<OnboardingState> {
    const existing = await this.stateRepo.get(tenantId);
    if (existing) return existing;

    const accounts = await this.accountsRepo.findAll(tenantId);
    const now = nowISO();
    return this.stateRepo.upsert({
      id: generateId(),
      tenantId,
      status: accounts.length > 0 ? OnboardingStatus.COMPLETED_MANUAL : OnboardingStatus.PENDING,
      draft: createEmptyDraft(),
      conversationSummary: null,
      language: null,
      appliedEntityIds: {},
      confirmIdempotencyKey: null,
      appliedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Usuário dispensou o assistente para configurar manualmente. Esse é o
   * único gatilho de seedDefaults: só quando o usuário opta explicitamente
   * por não usar o assistente de IA é que a base mínima (conta principal,
   * tipos de conta, categorias) é criada automaticamente — se ele seguir
   * pelo assistente, é a IA quem propõe/cria essas entidades.
   */
  async skip(tenantId: string): Promise<OnboardingState> {
    const state = await this.transition(tenantId, OnboardingStatus.SKIPPED);
    await this.tenantBootstrap.seedDefaults(tenantId);
    return state;
  }

  /** Configuração manual concluída (fora do assistente). */
  async completeManual(tenantId: string): Promise<OnboardingState> {
    return this.transition(tenantId, OnboardingStatus.COMPLETED_MANUAL);
  }

  async getConversation(tenantId: string): Promise<OnboardingMessage[]> {
    return this.messagesRepo.findAll(tenantId);
  }

  async getDraft(tenantId: string): Promise<OnboardingDraft> {
    const state = await this.getState(tenantId);
    return state.draft;
  }

  async transition(tenantId: string, to: OnboardingStatus): Promise<OnboardingState> {
    const state = await this.getState(tenantId);
    if (!ALLOWED_TRANSITIONS[state.status].includes(to)) {
      throw new AppError(
        `Transição de onboarding inválida: ${state.status} → ${to}`,
        409,
        'onboarding.invalidTransition',
        { from: state.status, to },
      );
    }
    return this.stateRepo.upsert({ ...state, status: to, updatedAt: nowISO() });
  }
}
