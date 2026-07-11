import {
  AiChatRequest,
  AiChatResult,
  AiProvider,
  AiStopReason,
  AiToolCall,
} from '../ai-provider.types';
import { AiProviderUnavailableError } from '../ai.errors';

/**
 * Passo de roteiro do provider fake. Cada chamada a chat() consome um passo,
 * na ordem em que foram enfileirados.
 */
export interface FakeAiStep {
  text?: string;
  toolCalls?: AiToolCall[];
  stopReason?: AiStopReason;
  /** Simula falha do provedor nesta chamada. */
  error?: Error;
}

/**
 * Provider determinístico para testes e desenvolvimento sem provedor real.
 * Guarda as requisições recebidas para asserções (contexto enviado, tools
 * anunciadas, tool results devolvidos ao modelo).
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly requests: AiChatRequest[] = [];
  private readonly steps: FakeAiStep[] = [];

  constructor(steps: FakeAiStep[] = []) {
    this.steps.push(...steps);
  }

  enqueue(step: FakeAiStep): void {
    this.steps.push(step);
  }

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    if (request.signal?.aborted) {
      throw new AiProviderUnavailableError(new Error('Requisição abortada'));
    }

    this.requests.push(request);

    const step = this.steps.shift();
    if (!step) {
      return { text: 'ok', toolCalls: [], stopReason: 'end_turn' };
    }
    if (step.error) {
      throw step.error;
    }

    const toolCalls = step.toolCalls ?? [];
    return {
      text: step.text ?? '',
      toolCalls,
      stopReason: step.stopReason ?? (toolCalls.length > 0 ? 'tool_use' : 'end_turn'),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
