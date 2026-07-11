import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from './fake-ai.provider';
import { AiChatRequest } from '../ai-provider.types';
import { AiProviderUnavailableError, AiTimeoutError } from '../ai.errors';

function request(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    system: 'system prompt',
    messages: [{ role: 'user', content: 'olá' }],
    maxOutputTokens: 256,
    ...overrides,
  };
}

describe('FakeAiProvider', () => {
  it('consome os passos do roteiro na ordem', async () => {
    const provider = new FakeAiProvider([
      { text: 'primeira' },
      {
        toolCalls: [{ id: 'call_1', name: 'propose_account', input: { name: 'Nubank' } }],
      },
    ]);

    const first = await provider.chat(request());
    expect(first.text).toBe('primeira');
    expect(first.stopReason).toBe('end_turn');

    const second = await provider.chat(request());
    expect(second.toolCalls).toHaveLength(1);
    expect(second.toolCalls[0].name).toBe('propose_account');
    expect(second.stopReason).toBe('tool_use');
  });

  it('responde com default quando o roteiro acaba', async () => {
    const provider = new FakeAiProvider();
    const result = await provider.chat(request());
    expect(result.text).toBe('ok');
    expect(result.toolCalls).toEqual([]);
  });

  it('captura as requisições para asserções', async () => {
    const provider = new FakeAiProvider([{ text: 'x' }]);
    await provider.chat(request({ system: 'instruções' }));
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].system).toBe('instruções');
  });

  it('simula erro do provedor', async () => {
    const provider = new FakeAiProvider([{ error: new AiTimeoutError() }]);
    await expect(provider.chat(request())).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it('respeita signal já abortado', async () => {
    const provider = new FakeAiProvider([{ text: 'nunca' }]);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.chat(request({ signal: controller.signal }))).rejects.toBeInstanceOf(
      AiProviderUnavailableError,
    );
    expect(provider.requests).toHaveLength(0);
  });
});
