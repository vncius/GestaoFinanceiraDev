import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicAiProvider, AnthropicMessagesApi } from './anthropic.provider';
import { AiChatRequest } from '../ai-provider.types';
import { loadAiConfig } from '../ai.config';
import {
  AiConfigError,
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../ai.errors';

const CONFIG = loadAiConfig({
  AI_PROVIDER: 'anthropic',
  AI_API_KEY: 'sk-teste',
  AI_MODEL: 'modelo-teste',
});

function sdkMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'modelo-teste',
    content: [{ type: 'text', text: 'olá', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 } as Anthropic.Usage,
    ...overrides,
  } as Anthropic.Message;
}

function makeProvider(
  respond: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>,
) {
  const captured: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const api: AnthropicMessagesApi = {
    create: (params) => {
      captured.push(params);
      return respond(params);
    },
  };
  return { provider: new AnthropicAiProvider(CONFIG, api), captured };
}

function request(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    system: 'instruções',
    messages: [{ role: 'user', content: 'oi' }],
    maxOutputTokens: 512,
    ...overrides,
  };
}

describe('AnthropicAiProvider', () => {
  it('mapeia system, mensagens, tools e limites para o formato do SDK', async () => {
    const { provider, captured } = makeProvider(async () => sdkMessage());
    await provider.chat(
      request({
        tools: [
          {
            name: 'propose_account',
            description: 'Propõe conta',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }),
    );

    const params = captured[0];
    expect(params.model).toBe('modelo-teste');
    expect(params.system).toBe('instruções');
    expect(params.max_tokens).toBe(512);
    expect(params.messages).toEqual([{ role: 'user', content: 'oi' }]);
    expect(params.tools?.[0]).toMatchObject({ name: 'propose_account' });
  });

  it('converte assistant com tool calls e mescla tool results em uma única mensagem user', async () => {
    const { provider, captured } = makeProvider(async () => sdkMessage());
    await provider.chat(
      request({
        messages: [
          { role: 'user', content: 'crie duas contas' },
          {
            role: 'assistant',
            content: 'vou criar',
            toolCalls: [
              { id: 'call_1', name: 'propose_account', input: { name: 'A' } },
              { id: 'call_2', name: 'propose_account', input: { name: 'B' } },
            ],
          },
          { role: 'tool_result', toolCallId: 'call_1', content: '{"ok":true}' },
          { role: 'tool_result', toolCallId: 'call_2', content: '{"ok":false}', isError: true },
        ],
      }),
    );

    const messages = captured[0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe('assistant');
    const assistantBlocks = messages[1].content as Anthropic.ContentBlockParam[];
    expect(assistantBlocks[0]).toMatchObject({ type: 'text', text: 'vou criar' });
    expect(assistantBlocks[1]).toMatchObject({ type: 'tool_use', id: 'call_1' });
    expect(assistantBlocks[2]).toMatchObject({ type: 'tool_use', id: 'call_2' });

    // Os dois tool_results na MESMA mensagem user (exigência de tool use paralelo)
    const resultBlocks = messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(messages[2].role).toBe('user');
    expect(resultBlocks).toHaveLength(2);
    expect(resultBlocks[1]).toMatchObject({ tool_use_id: 'call_2', is_error: true });
  });

  it('converte resposta com tool_use em toolCalls neutros', async () => {
    const { provider } = makeProvider(async () =>
      sdkMessage({
        content: [
          { type: 'text', text: 'vou registrar', citations: null },
          {
            type: 'tool_use',
            id: 'call_9',
            name: 'propose_income',
            input: { description: 'Salário' },
          },
        ] as Anthropic.ContentBlock[],
        stop_reason: 'tool_use',
      }),
    );

    const result = await provider.chat(request());
    expect(result.text).toBe('vou registrar');
    expect(result.toolCalls).toEqual([
      { id: 'call_9', name: 'propose_income', input: { description: 'Salário' } },
    ]);
    expect(result.stopReason).toBe('tool_use');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('mapeia stop_reason desconhecido para end_turn', async () => {
    const { provider } = makeProvider(async () =>
      sdkMessage({ stop_reason: 'refusal' as Anthropic.Message['stop_reason'] }),
    );
    const result = await provider.chat(request());
    expect(result.stopReason).toBe('end_turn');
  });

  describe('mapeamento de erros do provedor', () => {
    function failingProvider(error: Error) {
      return makeProvider(async () => {
        throw error;
      }).provider;
    }

    it('429 → AiRateLimitedError', async () => {
      const error = Object.assign(new Error('rate limited'), { status: 429 });
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(
        AiRateLimitedError,
      );
    });

    it('401 → AiConfigError (sem vazar a chave)', async () => {
      const error = Object.assign(new Error('invalid x-api-key'), { status: 401 });
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(AiConfigError);
    });

    it('timeout/abort → AiTimeoutError', async () => {
      const error = new Error('aborted');
      error.name = 'APIUserAbortError';
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(AiTimeoutError);
    });

    it('5xx/conexão → AiProviderUnavailableError', async () => {
      const error = Object.assign(new Error('overloaded'), { status: 529 });
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(
        AiProviderUnavailableError,
      );
    });
  });
});
