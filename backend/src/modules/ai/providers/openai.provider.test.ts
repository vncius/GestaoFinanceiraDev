import { describe, expect, it } from 'vitest';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { OpenAiProvider, OpenAiChatApi } from './openai.provider';
import { AiChatRequest } from '../ai-provider.types';
import { loadAiConfig } from '../ai.config';
import {
  AiConfigError,
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../ai.errors';

const CONFIG = loadAiConfig({
  AI_PROVIDER: 'openai',
  AI_API_KEY: 'sk-teste',
  AI_MODEL: 'gpt-4o-mini',
});

function chatCompletion(overrides: Partial<ChatCompletion> = {}): ChatCompletion {
  return {
    id: 'chatcmpl_1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'olá', refusal: null },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...overrides,
  } as ChatCompletion;
}

function makeProvider(respond: (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>) {
  const captured: ChatCompletionCreateParamsNonStreaming[] = [];
  const api: OpenAiChatApi = {
    create: (params) => {
      captured.push(params);
      return respond(params);
    },
  };
  return { provider: new OpenAiProvider(CONFIG, api), captured };
}

function request(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    system: 'instruções',
    messages: [{ role: 'user', content: 'oi' }],
    maxOutputTokens: 512,
    ...overrides,
  };
}

describe('OpenAiProvider', () => {
  it('mapeia system (primeira mensagem), tools e limite de tokens para o formato do SDK', async () => {
    const { provider, captured } = makeProvider(async () => chatCompletion());
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
    expect(params.model).toBe('gpt-4o-mini');
    expect(params.max_completion_tokens).toBe(512);
    expect(params.messages[0]).toEqual({ role: 'system', content: 'instruções' });
    expect(params.messages[1]).toEqual({ role: 'user', content: 'oi' });
    expect(params.tools?.[0]).toMatchObject({
      type: 'function',
      function: { name: 'propose_account' },
    });
  });

  it('converte assistant com tool calls e cada tool_result em mensagem `tool` separada', async () => {
    const { provider, captured } = makeProvider(async () => chatCompletion());
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

    const messages = captured[0].messages as ChatCompletionMessageParam[];
    // system + user + assistant + 2 tool messages separadas (sem merge, diferente da Anthropic)
    expect(messages).toHaveLength(5);
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      content: 'vou criar',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'propose_account', arguments: '{"name":"A"}' } },
        { id: 'call_2', type: 'function', function: { name: 'propose_account', arguments: '{"name":"B"}' } },
      ],
    });
    expect(messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' });
    expect(messages[4]).toEqual({ role: 'tool', tool_call_id: 'call_2', content: '{"ok":false}' });
  });

  it('converte resposta com tool_calls em toolCalls neutros', async () => {
    const { provider } = makeProvider(async () =>
      chatCompletion({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'vou registrar',
              refusal: null,
              tool_calls: [
                {
                  id: 'call_9',
                  type: 'function',
                  function: { name: 'propose_income', arguments: '{"description":"Salário"}' },
                },
              ] as ChatCompletionMessageToolCall[],
            },
            finish_reason: 'tool_calls',
            logprobs: null,
          },
        ],
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

  it('argumentos de tool call malformados viram objeto vazio (não derruba o turno)', async () => {
    const { provider } = makeProvider(async () =>
      chatCompletion({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'propose_account', arguments: '{not json' },
                },
              ] as ChatCompletionMessageToolCall[],
            },
            finish_reason: 'tool_calls',
            logprobs: null,
          },
        ],
      }),
    );

    const result = await provider.chat(request());
    expect(result.toolCalls[0].input).toEqual({});
  });

  it('mapeia finish_reason "length" para max_tokens e demais para end_turn', async () => {
    const { provider } = makeProvider(async () =>
      chatCompletion({
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'parcial', refusal: null },
            finish_reason: 'length',
            logprobs: null,
          },
        ],
      }),
    );
    const result = await provider.chat(request());
    expect(result.stopReason).toBe('max_tokens');
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
      const error = Object.assign(new Error('invalid api key'), { status: 401 });
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(AiConfigError);
    });

    it('timeout/abort → AiTimeoutError', async () => {
      const error = new Error('aborted');
      error.name = 'APIUserAbortError';
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(AiTimeoutError);
    });

    it('5xx/conexão → AiProviderUnavailableError', async () => {
      const error = Object.assign(new Error('service unavailable'), { status: 503 });
      await expect(failingProvider(error).chat(request())).rejects.toBeInstanceOf(
        AiProviderUnavailableError,
      );
    });
  });
});
