import { describe, expect, it } from 'vitest';
import { createAiProvider } from './create-ai-provider';
import { loadAiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { FakeAiProvider } from './providers/fake-ai.provider';
import { AnthropicAiProvider } from './providers/anthropic.provider';

describe('createAiProvider', () => {
  it('cria o provider fake por default', () => {
    const provider = createAiProvider(loadAiConfig({}));
    expect(provider).toBeInstanceOf(FakeAiProvider);
    expect(provider.name).toBe('fake');
  });

  it('cria o provider anthropic quando configurado com chave e modelo', () => {
    const provider = createAiProvider(
      loadAiConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-teste' }),
    );
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('rejeita anthropic sem AI_API_KEY', () => {
    expect(() => createAiProvider(loadAiConfig({ AI_PROVIDER: 'anthropic' }))).toThrow(
      AiConfigError,
    );
  });

  it('rejeita anthropic com AI_MODEL vazio', () => {
    expect(() =>
      createAiProvider(
        loadAiConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-teste', AI_MODEL: '' }),
      ),
    ).toThrow(AiConfigError);
  });
});
