import { api } from './api';

export type OnboardingStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'COMPLETED_MANUAL';

/** Status que ainda pedem a atenção do usuário no onboarding. */
export const OPEN_ONBOARDING_STATUSES: OnboardingStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'AWAITING_CONFIRMATION',
];

export interface OnboardingStatusResponse {
  status: OnboardingStatus;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  turn: number;
  status: 'OK' | 'FAILED' | 'CANCELED';
  createdAt: string;
}

export interface OnboardingDraftItem {
  draftItemId: string;
  source: 'ai' | 'user';
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDraft {
  accountTypes: OnboardingDraftItem[];
  accounts: OnboardingDraftItem[];
  categories: OnboardingDraftItem[];
  incomes: OnboardingDraftItem[];
  expenses: OnboardingDraftItem[];
  creditCards: OnboardingDraftItem[];
  settings: OnboardingDraftItem | null;
}

export interface ConfirmResponse {
  status: OnboardingStatus;
  appliedEntityIds: Record<string, string>;
  alreadyApplied: boolean;
}

export interface SendMessagePayload {
  message: string;
  language?: 'pt' | 'en' | 'es';
}

export interface SendMessageResponse {
  assistantMessage: OnboardingMessage;
  status: OnboardingStatus;
  summaryPresented: boolean;
  draft: unknown;
}

export const OnboardingService = {
  getStatus: (): Promise<OnboardingStatusResponse> =>
    api.get<OnboardingStatusResponse>('/onboarding/status').then((r) => r.data),

  skip: (): Promise<OnboardingStatusResponse> =>
    api.post<OnboardingStatusResponse>('/onboarding/skip').then((r) => r.data),

  completeManual: (): Promise<OnboardingStatusResponse> =>
    api.post<OnboardingStatusResponse>('/onboarding/complete-manual').then((r) => r.data),

  getConversation: (): Promise<OnboardingMessage[]> =>
    api.get<OnboardingMessage[]>('/onboarding/conversation').then((r) => r.data),

  sendMessage: (payload: SendMessagePayload): Promise<SendMessageResponse> =>
    api.post<SendMessageResponse>('/onboarding/messages', payload).then((r) => r.data),

  getDraft: (): Promise<OnboardingDraft> =>
    api.get<OnboardingDraft>('/onboarding/draft').then((r) => r.data),

  updateDraftItem: (
    draftItemId: string,
    payload: Record<string, unknown>,
  ): Promise<{ item: OnboardingDraftItem; draft: OnboardingDraft }> =>
    api
      .put<{ item: OnboardingDraftItem; draft: OnboardingDraft }>(
        `/onboarding/draft/items/${draftItemId}`,
        { payload },
      )
      .then((r) => r.data),

  removeDraftItem: (draftItemId: string): Promise<{ draft: OnboardingDraft }> =>
    api
      .delete<{ draft: OnboardingDraft }>(`/onboarding/draft/items/${draftItemId}`)
      .then((r) => r.data),

  confirm: (idempotencyKey: string): Promise<ConfirmResponse> =>
    api.post<ConfirmResponse>('/onboarding/confirm', { idempotencyKey }).then((r) => r.data),
};
