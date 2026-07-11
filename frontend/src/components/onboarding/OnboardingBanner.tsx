import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import {
  OnboardingService,
  OPEN_ONBOARDING_STATUSES,
} from '../../services/onboarding.service';

/** Lembrete no dashboard enquanto a configuração inicial estiver pendente. */
export default function OnboardingBanner() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: OnboardingService.getStatus,
  });

  if (!data || !OPEN_ONBOARDING_STATUSES.includes(data.status)) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="shrink-0" />
        <span>{t('banner.message')}</span>
      </div>
      <button
        onClick={() => navigate('/onboarding')}
        className="shrink-0 font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
      >
        {t('banner.cta')}
      </button>
    </div>
  );
}
