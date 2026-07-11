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

export const OnboardingService = {
  getStatus: (): Promise<OnboardingStatusResponse> =>
    api.get<OnboardingStatusResponse>('/onboarding/status').then((r) => r.data),

  skip: (): Promise<OnboardingStatusResponse> =>
    api.post<OnboardingStatusResponse>('/onboarding/skip').then((r) => r.data),

  completeManual: (): Promise<OnboardingStatusResponse> =>
    api.post<OnboardingStatusResponse>('/onboarding/complete-manual').then((r) => r.data),
};
