import { describe, expect, it } from 'vitest';
import { createAiProvider } from './create-ai-provider';
import { loadAiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { FakeAiProvider } from './providers/fake-ai.provider';
import { AnthropicAiProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

describe('createAiProvider', () => {
  it('cria o provider fake por default', () => {
    const provider = createAiProvider(loadAiConfig({}));
    expect(provider).toBeInstanceOf(FakeAiProvider);
    expect(provider.name).toBe('fake');
  });

  it('cria o provider anthropic quando configurado com chave e modelo', () => {
    const provider = createAiProvider(
      loadAiConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-teste', AI_MODEL: 'claude-opus-4-8' }),
    );
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('rejeita anthropic sem AI_API_KEY', () => {
    expect(() =>
      createAiProvider(loadAiConfig({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-opus-4-8' })),
    ).toThrow(AiConfigError);
  });

  it('rejeita anthropic sem AI_MODEL', () => {
    expect(() =>
      createAiProvider(loadAiConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-teste' })),
    ).toThrow(AiConfigError);
  });

  it('cria o provider openai quando configurado com chave e modelo', () => {
    const provider = createAiProvider(
      loadAiConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-teste', AI_MODEL: 'gpt-4o-mini' }),
    );
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider.name).toBe('openai');
  });

  it('rejeita openai sem AI_API_KEY', () => {
    expect(() =>
      createAiProvider(loadAiConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4o-mini' })),
    ).toThrow(AiConfigError);
  });

  it('rejeita openai sem AI_MODEL', () => {
    expect(() =>
      createAiProvider(loadAiConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-teste' })),
    ).toThrow(AiConfigError);
  });
});
