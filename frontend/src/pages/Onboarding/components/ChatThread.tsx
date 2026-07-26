import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCcw } from 'lucide-react';
import { OnboardingMessage } from '../../../services/onboarding.service';

interface ChatThreadProps {
  messages: OnboardingMessage[];
  pendingMessage: string | null;
  failedMessage: string | null;
  sendError: Error | null;
  sending?: boolean;
  onRetry: (message: string) => void;
}

/**
 * Thread da conversa. Conteúdo do assistente é SEMPRE renderizado como texto
 * puro (whitespace-pre-wrap) — nunca HTML vindo do modelo.
 *
 * A resposta do backend chega inteira (sem streaming real — ver
 * docs/architecture/onboarding-ai.md), então a digitação progressiva abaixo é
 * só efeito visual: revela o texto já recebido em poucos passos rápidos.
 */
export default function ChatThread({
  messages,
  pendingMessage,
  failedMessage,
  sendError,
  sending = false,
  onRetry,
}: ChatThreadProps) {
  const { t } = useTranslation('onboarding');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Só anima a mensagem do assistente que acabou de chegar nesta sessão —
  // histórico carregado/retomado aparece direto, sem "digitar" de novo.
  // Ajuste de estado durante a renderização (padrão React de "estado derivado
  // de props"): precisa decidir o streamingId ANTES do primeiro paint da nova
  // mensagem, senão ela pisca inteira antes de começar a "digitar".
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [prevMessages, setPrevMessages] = useState(messages);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  if (messages !== prevMessages) {
    if (!initialized.current) {
      messages.forEach((m) => seenIds.current.add(m.id));
      initialized.current = true;
    } else {
      const newAssistant = messages.find(
        (m) => m.role === 'ASSISTANT' && !seenIds.current.has(m.id),
      );
      messages.forEach((m) => seenIds.current.add(m.id));
      if (newAssistant) setStreamingId(newAssistant.id);
    }
    setPrevMessages(messages);
  }

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
        <div className="max-w-md mx-auto py-6 space-y-4">
          <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700 px-4 py-3.5 text-sm text-gray-700 dark:text-gray-200 space-y-2">
            <p className="font-semibold text-gray-900 dark:text-gray-50">{t('chat.welcomeTitle')}</p>
            <p>{t('chat.welcomeMainAccount')}</p>
            <p>{t('chat.welcomeReserveAccount')}</p>
            <p>{t('chat.welcomeCreditCard')}</p>
          </div>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t('chat.emptyHint')}
          </p>
        </div>
      )}

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          role={message.role}
          content={message.content}
          animate={message.id === streamingId}
        />
      ))}

      {pendingMessage && (
        <>
          <MessageBubble role="USER" content={pendingMessage} />
          <div className="flex justify-start" data-testid="typing-indicator">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm text-gray-500 dark:text-gray-300">
              <span className="sr-only">{t('chat.typing')}</span>
              <span className="inline-flex items-center gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
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
                disabled={sending}
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {t('chat.retry')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// Passos fixos (não por caractere) para a duração total do efeito não crescer
// com mensagens longas — é só uma simulação visual, o texto já chegou inteiro.
const TYPEWRITER_STEPS = 16;
const TYPEWRITER_STEP_MS = 25;

function MessageBubble({
  role,
  content,
  failed = false,
  animate = false,
}: {
  role: 'USER' | 'ASSISTANT';
  content: string;
  failed?: boolean;
  animate?: boolean;
}) {
  const isUser = role === 'USER';
  const displayed = useTypewriter(content, animate && !isUser);
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? `rounded-br-sm text-white ${failed ? 'bg-red-400 dark:bg-red-500/70' : 'bg-blue-600'}`
            : 'rounded-bl-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}
      >
        {displayed}
      </div>
    </div>
  );
}

/** Revela `text` em poucos passos rápidos, simulando streaming. */
function useTypewriter(text: string, active: boolean): string {
  const [length, setLength] = useState(active ? 0 : text.length);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    let reducedMotion = false;
    try {
      reducedMotion =
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
      reducedMotion = false;
    }
    if (reducedMotion) {
      setLength(text.length);
      return;
    }
    startedRef.current = true;
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setLength(Math.ceil((text.length * step) / TYPEWRITER_STEPS));
      if (step >= TYPEWRITER_STEPS) clearInterval(interval);
    }, TYPEWRITER_STEP_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return active ? text.slice(0, length) : text;
}
