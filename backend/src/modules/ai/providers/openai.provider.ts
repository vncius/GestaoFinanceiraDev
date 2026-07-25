import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
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

// Único arquivo do backend que conhece o SDK da OpenAI (ADR 0002). A tradução
// formato neutro ↔ formato do provedor acontece toda aqui — nenhum service de
// domínio importa tipos do SDK. Usa a Chat Completions API (`/v1/chat/completions`),
// estável e amplamente documentada; só tools do tipo "function" são suportadas
// (suficiente para o conjunto fechado de tools do onboarding — ADR 0003).

/** Superfície mínima do SDK usada pelo provider — injetável nos testes. */
export interface OpenAiChatApi {
  create(
    params: ChatCompletionCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletion>;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly chatApi: OpenAiChatApi;

  constructor(
    private readonly config: AiConfig,
    chatApi?: OpenAiChatApi,
  ) {
    if (chatApi) {
      this.chatApi = chatApi;
    } else {
      const client = new OpenAI({
        apiKey: config.apiKey,
        timeout: config.requestTimeoutMs,
        // Retry limitado para falhas transitórias (408/429/5xx/conexão).
        maxRetries: 1,
      });
      this.chatApi = client.chat.completions;
    }
  }

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: this.config.model,
      max_completion_tokens: request.maxOutputTokens,
      messages: toOpenAiMessages(request.system, request.messages),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }

    let response: ChatCompletion;
    try {
      response = await this.chatApi.create(params, { signal: request.signal });
    } catch (error) {
      throw mapProviderError(error);
    }

    return toAiChatResult(response);
  }
}

// ─── Mapeamento neutro → SDK ────────────────────────────────────────────────────

function toOpenAiMessages(system: string, messages: AiMessage[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];

  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      const toolCalls: ChatCompletionMessageToolCall[] = (message.toolCalls ?? []).map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
      }));
      result.push({
        role: 'assistant',
        content: message.content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // tool_result: ao contrário da Anthropic, a OpenAI espera uma mensagem
    // `role: 'tool'` separada por resultado — não precisa mesclar.
    result.push({
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    });
  }

  return result;
}

// ─── Mapeamento SDK → neutro ────────────────────────────────────────────────────

function toAiChatResult(response: ChatCompletion): AiChatResult {
  const choice = response.choices[0];
  const message = choice?.message;

  const toolCalls: AiToolCall[] = (message?.tool_calls ?? [])
    .filter((call): call is Extract<ChatCompletionMessageToolCall, { type: 'function' }> =>
      call.type === 'function',
    )
    .map((call) => ({
      id: call.id,
      name: call.function.name,
      input: safeJsonParse(call.function.arguments),
    }));

  return {
    text: message?.content ?? '',
    toolCalls,
    stopReason: toStopReason(choice?.finish_reason ?? null),
    usage: response.usage
      ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
      : undefined,
  };
}

function toStopReason(finishReason: string | null): AiStopReason {
  switch (finishReason) {
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      // stop, content_filter etc. encerram o turno.
      return 'end_turn';
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Argumentos inválidos viram objeto vazio; a validação Zod da tool
    // rejeita e o erro volta ao modelo para autocorreção (tool-registry.ts).
    return {};
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
