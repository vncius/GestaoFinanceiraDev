import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, LogOut, Settings2, Sparkles } from 'lucide-react';
import { OnboardingService, OPEN_ONBOARDING_STATUSES } from '../../services/onboarding.service';
import { deferOnboarding } from '../../components/onboarding/OnboardingGate';
import { Button } from '../../components/ui/Button';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Language } from '../../i18n';
import OnboardingChat from './components/OnboardingChat';
import DraftReview from './components/DraftReview';

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

type View = 'choice' | 'assistant' | 'review';

export default function Onboarding() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const startAssistant = (location.state as { startAssistant?: boolean } | null)?.startAssistant === true;
  const [view, setView] = useState<View>(startAssistant ? 'assistant' : 'choice');

  const statusQuery = useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: OnboardingService.getStatus,
  });

  const skipMutation = useMutation({
    mutationFn: OnboardingService.skip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      navigate('/settings');
    },
  });

  if (statusQuery.isLoading) return <PageLoading />;

  if (statusQuery.isError) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900 p-6">
        <LogoutButton />
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('loadError')}</p>
        <Button variant="secondary" onClick={() => statusQuery.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const status = statusQuery.data?.status;
  if (status && !OPEN_ONBOARDING_STATUSES.includes(status)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Proposta pronta cai direto na revisão; "voltar ao chat" é explícito.
  const showReview = view === 'review' || (view === 'choice' && status === 'AWAITING_CONFIRMATION');
  // Conversa já iniciada: vai direto para a área do assistente.
  const showAssistant =
    !showReview &&
    (view === 'assistant' || status === 'IN_PROGRESS' || status === 'AWAITING_CONFIRMATION');

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <LogoutButton />
      <div className="w-full max-w-2xl">
        {showReview ? (
          <DraftReview onBackToChat={() => setView('assistant')} />
        ) : showAssistant ? (
          <OnboardingChat
            status={status ?? 'PENDING'}
            onManual={() => skipMutation.mutate()}
            manualLoading={skipMutation.isPending}
            onReview={() => setView('review')}
          />
        ) : (
          <div className="space-y-6">
            <LanguageStep />

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
                {t('entry.title')}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('entry.subtitle')}</p>
            </div>

            <div className="grid gap-4">
              <ChoiceCard
                icon={<Sparkles size={20} className="text-blue-600 dark:text-blue-400" />}
                title={t('entry.assistant.title')}
                description={t('entry.assistant.description')}
                onClick={() => setView('assistant')}
                testId="choice-assistant"
              />
              <ChoiceCard
                icon={<Settings2 size={20} className="text-gray-600 dark:text-gray-300" />}
                title={t('entry.manual.title')}
                description={t('entry.manual.description')}
                onClick={() => skipMutation.mutate()}
                loading={skipMutation.isPending}
                testId="choice-manual"
              />
              <ChoiceCard
                icon={<Clock size={20} className="text-gray-600 dark:text-gray-300" />}
                title={t('entry.later.title')}
                description={t('entry.later.description')}
                onClick={() => {
                  deferOnboarding();
                  navigate('/dashboard');
                }}
                testId="choice-later"
              />
            </div>

            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              {t('entry.aiDisclaimer')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LogoutButton() {
  const { t } = useTranslation('onboarding');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      data-testid="onboarding-logout"
      title={t('logout')}
      aria-label={t('logout')}
      className="absolute top-4 right-4 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
    </button>
  );
}

function LanguageStep() {
  const { t } = useTranslation('onboarding');
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex flex-col items-center gap-2" data-testid="onboarding-language-step">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {t('entry.language.question')}
      </p>
      <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
        {LANGUAGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`onboarding-language-${opt.value}`}
            onClick={() => setLanguage(opt.value)}
            aria-pressed={language === opt.value}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              language === opt.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
  loading = false,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
  testId: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={loading}
      className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{loading ? <Loader2 size={20} className="animate-spin" /> : icon}</div>
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-50">{title}</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </button>
  );
}

