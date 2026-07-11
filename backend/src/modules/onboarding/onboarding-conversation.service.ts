import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AiConfig } from '../ai/ai.config';
import { AiMessage, AiProvider } from '../ai/ai-provider.types';
import { AiToolRegistry, AiToolRunner } from '../ai/tool-registry';
import { OnboardingService } from './onboarding.service';
import { OnboardingContextService } from './onboarding-context.service';
import { buildOnboardingSystemPrompt } from './onboarding-prompts';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import {
  OnboardingMessage,
  OnboardingMessageRole,
  OnboardingMessageStatus,
  OnboardingState,
  OnboardingStatus,
} from './onboarding.types';

// Janela de histórico textual enviada ao modelo. O que saiu da janela já está
// refletido no draft (fonte da verdade estruturada) — ver ai-context.md.
const MESSAGE_WINDOW = 12;

export interface ConversationLimits {
  /** Teto de turnos (mensagens do usuário) por conversa. */
  maxTurns: number;
}

export interface ConversationTurnResult {
  assistantMessage: OnboardingMessage;
  status: OnboardingStatus;
  /** true quando o modelo chamou present_setup_summary neste turno. */
  summaryPresented: boolean;
}

export class OnboardingConversationService {
  constructor(
    private readonly aiProvider: AiProvider,
    private readonly aiConfig: AiConfig,
    private readonly toolRegistry: AiToolRegistry,
    private readonly onboardingService: OnboardingService,
    private readonly contextService: OnboardingContextService,
    private readonly stateRepo: OnboardingStateRepository,
    private readonly messagesRepo: OnboardingMessagesRepository,
    private readonly limits: ConversationLimits = { maxTurns: 60 },
  ) {}

  async sendMessage(
    tenantId: string,
    userText: string,
    requestedLanguage?: string,
  ): Promise<ConversationTurnResult> {
    let state = await this.onboardingService.getState(tenantId);
    state = await this.ensureConversationOpen(state);
    state = await this.ensureLanguage(state, requestedLanguage);
    const language = state.language ?? 'pt';

    const history = await this.messagesRepo.findAll(tenantId);
    const turn = history.filter((m) => m.role === OnboardingMessageRole.USER).length + 1;
    if (turn > this.limits.maxTurns) {
      throw new AppError(
        `Limite de ${this.limits.maxTurns} turnos da conversa atingido`,
        429,
        'onboarding.conversation.turnLimit',
        { maxTurns: this.limits.maxTurns },
      );
    }

    // Monta as mensagens do modelo: contexto do sistema + janela de histórico
    // + mensagem atual. Persistência só acontece ao fim do turno bem-sucedido.
    const windowed = history.slice(-MESSAGE_WINDOW);
    const omitted = history.length - windowed.length;
    const messages: AiMessage[] = [
      { role: 'user', content: this.contextService.buildContextMessage(state, omitted) },
      ...windowed.map(toAiMessage),
      { role: 'user', content: userText },
    ];

    const runner = new AiToolRunner(
      this.toolRegistry,
      { tenantId, language },
      this.aiConfig.maxToolRoundsPerTurn,
    );
    const system = buildOnboardingSystemPrompt(language);
    const tools = this.toolRegistry.definitions();

    let assistantText = '';
    let summaryPresented = false;
    const maxChatCalls = this.aiConfig.maxToolRoundsPerTurn + 1;

    for (let call = 0; call < maxChatCalls; call++) {
      const timeout = AbortSignal.timeout(this.aiConfig.requestTimeoutMs);
      const result = await this.aiProvider.chat({
        system,
        messages,
        tools,
        maxOutputTokens: this.aiConfig.maxOutputTokens,
        signal: timeout,
      });

      if (result.toolCalls.length === 0) {
        assistantText = result.text;
        break;
      }

      messages.push({
        role: 'assistant',
        content: result.text,
        toolCalls: result.toolCalls,
      });

      for (const toolCall of result.toolCalls) {
        const toolResult = await runner.run(toolCall);
        if (toolResult.ok && toolCall.name === 'present_setup_summary') {
          summaryPresented = true;
        }
        messages.push({
          role: 'tool_result',
          toolCallId: toolCall.id,
          content: JSON.stringify(toolResult.output),
          isError: !toolResult.ok,
        });
      }

      // Guarda de segurança: se o modelo insistir em tools além do teto de
      // chamadas ao provedor, encerra o turno com o último texto disponível.
      assistantText = result.text;
    }

    const now = nowISO();
    await this.messagesRepo.create({
      id: generateId(),
      tenantId,
      role: OnboardingMessageRole.USER,
      content: userText,
      turn,
      status: OnboardingMessageStatus.OK,
      createdAt: now,
    });
    const assistantMessage = await this.messagesRepo.create({
      id: generateId(),
      tenantId,
      role: OnboardingMessageRole.ASSISTANT,
      content: assistantText,
      turn,
      status: OnboardingMessageStatus.OK,
      createdAt: nowISO(),
    });

    // As tools podem ter alterado draft/status durante o loop.
    const finalState = await this.onboardingService.getState(tenantId);
    return { assistantMessage, status: finalState.status, summaryPresented };
  }

  // ─── Internos ────────────────────────────────────────────────────────────────

  private async ensureConversationOpen(state: OnboardingState): Promise<OnboardingState> {
    switch (state.status) {
      case OnboardingStatus.IN_PROGRESS:
        return state;
      case OnboardingStatus.PENDING:
      case OnboardingStatus.AWAITING_CONFIRMATION:
        // Primeiro turno, ou usuário voltou da revisão para ajustar no chat.
        return this.onboardingService.transition(state.tenantId, OnboardingStatus.IN_PROGRESS);
      default:
        throw new AppError(
          `Conversa de onboarding indisponível com status ${state.status}`,
          409,
          'onboarding.conversation.closed',
          { status: state.status },
        );
    }
  }

  private async ensureLanguage(
    state: OnboardingState,
    requestedLanguage?: string,
  ): Promise<OnboardingState> {
    const language = requestedLanguage ?? state.language ?? 'pt';
    if (state.language === language) return state;
    return this.stateRepo.upsert({ ...state, language, updatedAt: nowISO() });
  }
}

function toAiMessage(message: OnboardingMessage): AiMessage {
  if (message.role === OnboardingMessageRole.USER) {
    return { role: 'user', content: message.content };
  }
  return { role: 'assistant', content: message.content };
}
