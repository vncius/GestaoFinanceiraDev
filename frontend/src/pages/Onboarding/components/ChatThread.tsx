import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { OnboardingMessage } from '../../../services/onboarding.service';

interface ChatThreadProps {
  messages: OnboardingMessage[];
  pendingMessage: string | null;
  failedMessage: string | null;
  sendError: Error | null;
  onRetry: (message: string) => void;
}

/**
 * Thread da conversa. Conteúdo do assistente é SEMPRE renderizado como texto
 * puro (whitespace-pre-wrap) — nunca HTML vindo do modelo.
 */
export default function ChatThread({
  messages,
  pendingMessage,
  failedMessage,
  sendError,
  onRetry,
}: ChatThreadProps) {
  const { t } = useTranslation('onboarding');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scrollIntoView não existe no jsdom (testes).
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingMessage, failedMessage]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t('chat.threadLabel')}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
    >
      {messages.length === 0 && !pendingMessage && !failedMessage && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
          {t('chat.emptyHint')}
        </p>
      )}

      {messages.map((message) => (
        <MessageBubble key={message.id} role={message.role} content={message.content} />
      ))}

      {pendingMessage && (
        <>
          <MessageBubble role="USER" content={pendingMessage} />
          <div className="flex justify-start" data-testid="typing-indicator">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-500 dark:text-gray-300">
              <span className="inline-flex gap-1 items-center">
                {t('chat.typing')}
                <span className="animate-pulse">…</span>
              </span>
            </div>
          </div>
        </>
      )}

      {failedMessage && (
        <div className="space-y-2">
          <MessageBubble role="USER" content={failedMessage} failed />
          <div className="flex justify-end">
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <span role="alert">{sendError?.message ?? t('chat.sendFailed')}</span>
              <button
                onClick={() => onRetry(failedMessage)}
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
              >
                <RotateCcw size={12} /> {t('chat.retry')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({
  role,
  content,
  failed = false,
}: {
  role: 'USER' | 'ASSISTANT';
  content: string;
  failed?: boolean;
}) {
  const isUser = role === 'USER';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? `rounded-br-sm text-white ${failed ? 'bg-red-400 dark:bg-red-500/70' : 'bg-blue-600'}`
            : 'rounded-bl-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
