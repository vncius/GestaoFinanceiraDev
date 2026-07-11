import Anthropic from '@anthropic-ai/sdk';
import {
  AiChatRequest,
  AiChatResult,
  AiMessage,
  AiProvider,
  AiStopReason,
  AiToolCall,
} from '../ai-provider.types';
import { AiConfig } from '../ai.config';
import {
  AiConfigError,
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../ai.errors';

// Único arquivo do backend que conhece o SDK da Anthropic (ADR 0002). A
// tradução formato neutro ↔ formato do provedor acontece toda aqui.
//
// Sem extended thinking: nosso formato neutro de mensagens não transporta
// thinking blocks, que precisariam ser reenviados intactos no loop de tools.
// Omitir o parâmetro roda o modelo sem thinking (comportamento do Opus 4.8).

/** Superfície mínima do SDK usada pelo provider — injetável nos testes. */
export interface AnthropicMessagesApi {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message>;
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly messagesApi: AnthropicMessagesApi;

  constructor(
    private readonly config: AiConfig,
    messagesApi?: AnthropicMessagesApi,
  ) {
    if (messagesApi) {
      this.messagesApi = messagesApi;
    } else {
      const client = new Anthropic({
        apiKey: config.apiKey,
        timeout: config.requestTimeoutMs,
        // Retry limitado para falhas transitórias (408/429/5xx/conexão).
        maxRetries: 1,
      });
      this.messagesApi = client.messages;
    }
  }

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.config.model,
      max_tokens: request.maxOutputTokens,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
    };
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      }));
    }

    let response: Anthropic.Message;
    try {
      response = await this.messagesApi.create(params, { signal: request.signal });
    } catch (error) {
      throw mapProviderError(error);
    }

    return toAiChatResult(response);
  }
}

// ─── Mapeamento neutro → SDK ────────────────────────────────────────────────────

function toAnthropicMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (message.content) {
        blocks.push({ type: 'text', text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: (call.input ?? {}) as Record<string, unknown>,
        });
      }
      result.push({ role: 'assistant', content: blocks });
      continue;
    }

    // tool_result: resultados de tools paralelas devem ir em UMA única
    // mensagem user — mescla com a anterior quando ela também é tool_result.
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: message.toolCallId,
      content: message.content,
      is_error: message.isError ?? false,
    };
    const previous = result[result.length - 1];
    if (previous && previous.role === 'user' && Array.isArray(previous.content)) {
      (previous.content as Anthropic.ContentBlockParam[]).push(block);
    } else {
      result.push({ role: 'user', content: [block] });
    }
  }

  return result;
}

// ─── Mapeamento SDK → neutro ────────────────────────────────────────────────────

function toAiChatResult(response: Anthropic.Message): AiChatResult {
  let text = '';
  const toolCalls: AiToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  return {
    text,
    toolCalls,
    stopReason: toStopReason(response.stop_reason),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function toStopReason(stopReason: Anthropic.Message['stop_reason']): AiStopReason {
  switch (stopReason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      // end_turn, stop_sequence, refusal etc. encerram o turno.
      return 'end_turn';
  }
}

// ─── Erros ──────────────────────────────────────────────────────────────────────

function mapProviderError(error: unknown): Error {
  const name = error instanceof Error ? error.name : '';
  if (name === 'APIUserAbortError' || name === 'AbortError' || name === 'APIConnectionTimeoutError') {
    return new AiTimeoutError();
  }

  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) {
    return new AiConfigError('credenciais recusadas pelo provedor');
  }
  if (status === 429) {
    return new AiRateLimitedError();
  }
  return new AiProviderUnavailableError(error);
}
