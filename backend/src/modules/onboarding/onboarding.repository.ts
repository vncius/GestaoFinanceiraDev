import { OnboardingMessage, OnboardingState } from './onboarding.types';

export interface OnboardingStateRepository {
  get(tenantId: string): Promise<OnboardingState | null>;
  upsert(data: OnboardingState): Promise<OnboardingState>;
  deleteAll(tenantId: string): Promise<void>;
}

export interface OnboardingMessagesRepository {
  /** Mensagens do tenant ordenadas por turno e data. */
  findAll(tenantId: string): Promise<OnboardingMessage[]>;
  create(data: OnboardingMessage): Promise<OnboardingMessage>;
  deleteAll(tenantId: string): Promise<void>;
}
