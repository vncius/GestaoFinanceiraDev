import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  OnboardingService,
  OPEN_ONBOARDING_STATUSES,
} from '../../services/onboarding.service';

// "Responder depois": suprime o redirecionamento pelo resto da sessão do
// navegador; o banner no dashboard continua lembrando o usuário.
const DEFER_KEY = 'onboardingDeferred';

export function deferOnboarding(): void {
  sessionStorage.setItem(DEFER_KEY, '1');
}

export function isOnboardingDeferred(): boolean {
  return sessionStorage.getItem(DEFER_KEY) === '1';
}

/**
 * Gate pós-login: novos tenants (onboarding em aberto) são levados para
 * /onboarding. Tenants pré-existentes recebem COMPLETED_MANUAL retroativo no
 * backend e nunca são redirecionados.
 */
export default function OnboardingGate() {
  const location = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: OnboardingService.getStatus,
  });

  // Evita piscar o dashboard para usuários novos no primeiro carregamento.
  if (isLoading) return null;

  const shouldRedirect =
    data &&
    OPEN_ONBOARDING_STATUSES.includes(data.status) &&
    !isOnboardingDeferred() &&
    location.pathname !== '/onboarding';

  if (shouldRedirect) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
