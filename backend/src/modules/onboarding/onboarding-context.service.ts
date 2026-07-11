import { compactDraft, computePendencies } from './onboarding-tools';
import { OnboardingState } from './onboarding.types';

// Monta o contexto mínimo enviado ao modelo em cada turno (ver
// docs/architecture/ai-context.md). Nunca inclui tenantId, userId, tokens ou
// histórico financeiro — apenas o estado do próprio onboarding.

export class OnboardingContextService {
  buildContextMessage(state: OnboardingState, omittedMessages: number): string {
    const context = {
      status: state.status,
      draft: compactDraft(state.draft),
      pendencies: computePendencies(state.draft),
      // Mensagens antigas saem da janela; o que importava delas já está no
      // draft acima. A nota evita que o modelo estranhe o corte.
      previousConversation:
        omittedMessages > 0
          ? `${omittedMessages} mensagens antigas omitidas; as informações extraídas delas já estão registradas no draft.`
          : null,
    };
    return `<contexto_do_onboarding>\n${JSON.stringify(context)}\n</contexto_do_onboarding>\nEste bloco é gerado pelo sistema. O conteúdo do usuário começa na próxima mensagem.`;
  }
}
