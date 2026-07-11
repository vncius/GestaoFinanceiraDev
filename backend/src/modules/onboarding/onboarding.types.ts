export enum OnboardingStatus {
  /** Novo tenant que ainda não escolheu como configurar. */
  PENDING = 'PENDING',
  /** Conversa com o assistente iniciada. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Draft apresentado; aguardando o usuário revisar e confirmar. */
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  /** Draft confirmado e aplicado. */
  COMPLETED = 'COMPLETED',
  /** Usuário optou por configurar manualmente (assistente dispensado). */
  SKIPPED = 'SKIPPED',
  /** Configuração concluída fora do assistente (inclui tenants pré-existentes). */
  COMPLETED_MANUAL = 'COMPLETED_MANUAL',
}

export type OnboardingDraftSource = 'ai' | 'user';

/**
 * Item proposto no draft. O payload é tipado por seção na etapa do draft
 * estruturado; o contrato estável aqui é o identificador (base da
 * idempotência — ADR 0005) e a origem da proposta.
 */
export interface OnboardingDraftItem {
  draftItemId: string;
  source: OnboardingDraftSource;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Proposta estruturada de configuração inicial (ADR 0004). */
export interface OnboardingDraft {
  accountTypes: OnboardingDraftItem[];
  accounts: OnboardingDraftItem[];
  categories: OnboardingDraftItem[];
  incomes: OnboardingDraftItem[];
  expenses: OnboardingDraftItem[];
  creditCards: OnboardingDraftItem[];
  /** Configurações são singleton por tenant; no draft também. */
  settings: OnboardingDraftItem | null;
  /**
   * Maior número já emitido por seção. Garante que draftItemIds nunca sejam
   * reutilizados após remoção — uma ref antiga deve falhar como inválida, não
   * apontar silenciosamente para outro item.
   */
  itemCounters: Record<string, number>;
}

/** Estado do onboarding — singleton por tenant, como FinancialSettings. */
export interface OnboardingState {
  id: string;
  tenantId: string;
  status: OnboardingStatus;
  draft: OnboardingDraft;
  /** Resumo interno da conversa para não reenviar todo o histórico ao modelo. */
  conversationSummary: string | null;
  /** Idioma da conversa (pt/en/es), definido quando ela inicia. */
  language: string | null;
  /** draftItemId → id real criado; base da retomada idempotente (ADR 0005). */
  appliedEntityIds: Record<string, string>;
  confirmIdempotencyKey: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export enum OnboardingMessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export enum OnboardingMessageStatus {
  OK = 'OK',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

/**
 * Mensagem exibível da conversa. Tool calls/results não são persistidos —
 * o que importa deles fica refletido no draft.
 */
export interface OnboardingMessage {
  id: string;
  tenantId: string;
  role: OnboardingMessageRole;
  content: string;
  /** Ordena a conversa; um turno = mensagem do usuário + resposta do assistente. */
  turn: number;
  status: OnboardingMessageStatus;
  createdAt: string;
}

export function createEmptyDraft(): OnboardingDraft {
  return {
    accountTypes: [],
    accounts: [],
    categories: [],
    incomes: [],
    expenses: [],
    creditCards: [],
    settings: null,
    itemCounters: {},
  };
}
