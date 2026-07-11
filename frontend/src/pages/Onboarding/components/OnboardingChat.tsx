import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { OnboardingStatus } from '../../../services/onboarding.service';
import { PageLoading } from '../../../components/ui/LoadingSpinner';
import { Button } from '../../../components/ui/Button';
import { useOnboardingChat } from '../useOnboardingChat';
import ChatThread from './ChatThread';
import ChatInput from './ChatInput';

interface OnboardingChatProps {
  status: OnboardingStatus;
  onManual: () => void;
  manualLoading: boolean;
  onReview: () => void;
}

export default function OnboardingChat({
  status,
  onManual,
  manualLoading,
  onReview,
}: OnboardingChatProps) {
  const { t } = useTranslation('onboarding');
  const chat = useOnboardingChat();

  const summaryReady =
    status === 'AWAITING_CONFIRMATION' ||
    chat.lastResponse?.summaryPresented === true ||
    chat.lastResponse?.status === 'AWAITING_CONFIRMATION';

  if (chat.loadingConversation) return <PageLoading />;

  if (chat.conversationError) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('loadError')}</p>
        <Button variant="secondary" onClick={() => chat.refetchConversation()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden h-[75vh]">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
            {t('chat.title')}
          </span>
        </div>
        <Button variant="ghost" size="sm" loading={manualLoading} onClick={onManual}>
          {t('chat.manualCta')}
        </Button>
      </div>

      <ChatThread
        messages={chat.messages}
        pendingMessage={chat.pendingMessage}
        failedMessage={chat.failedMessage}
        sendError={chat.sendError}
        onRetry={chat.send}
      />

      {/* Resumo pronto para revisão (a tela de revisão liga aqui) */}
      {summaryReady && (
        <div
          data-testid="summary-ready"
          className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-800 dark:text-green-300"
        >
          <span className="flex items-center gap-2">
            <ClipboardCheck size={15} className="shrink-0" />
            {t('chat.summaryReady')}
          </span>
          <button
            onClick={onReview}
            data-testid="open-review"
            className="shrink-0 font-medium underline underline-offset-2 hover:text-green-900 dark:hover:text-green-100"
          >
            {t('chat.reviewCta')}
          </button>
        </div>
      )}

      <ChatInput disabled={chat.sending} onSend={chat.send} />

      {/* Aviso permanente */}
      <p className="px-4 pb-3 text-center text-xs text-gray-400 dark:text-gray-500">
        {t('chat.disclaimer')}
      </p>
    </div>
  );
}
