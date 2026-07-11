import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  OnboardingService,
  SendMessagePayload,
} from '../../services/onboarding.service';

/**
 * Estado do chat de onboarding: histórico persistido (retomada), envio com
 * mensagem otimista e retry. O backend só persiste o turno quando ele é
 * concluído com sucesso, então reenviar a mesma mensagem após falha é seguro.
 */
export function useOnboardingChat() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const conversationQuery = useQuery({
    queryKey: ['onboarding', 'conversation'],
    queryFn: OnboardingService.getConversation,
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => {
      const payload: SendMessagePayload = {
        message,
        language: i18n.language as SendMessagePayload['language'],
      };
      return OnboardingService.sendMessage(payload);
    },
    onMutate: () => setFailedMessage(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] });
    },
    onError: (_error, message) => setFailedMessage(message),
  });

  return {
    messages: conversationQuery.data ?? [],
    loadingConversation: conversationQuery.isLoading,
    conversationError: conversationQuery.isError,
    refetchConversation: conversationQuery.refetch,
    send: (message: string) => sendMutation.mutate(message),
    sending: sendMutation.isPending,
    /** Mensagem do turno em andamento (bolha otimista). */
    pendingMessage: sendMutation.isPending ? sendMutation.variables : null,
    /** Mensagem que falhou, para exibir com botão de reenviar. */
    failedMessage,
    sendError: sendMutation.error as Error | null,
    lastResponse: sendMutation.data ?? null,
  };
}
