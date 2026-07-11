import { describe, expect, it } from 'vitest';
import { createAiProvider } from './create-ai-provider';
import { loadAiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { FakeAiProvider } from './providers/fake-ai.provider';

describe('createAiProvider', () => {
  it('cria o provider fake por default', () => {
    const provider = createAiProvider(loadAiConfig({}));
    expect(provider).toBeInstanceOf(FakeAiProvider);
    expect(provider.name).toBe('fake');
  });

  it('falha explicitamente enquanto o provider real não está integrado', () => {
    expect(() => createAiProvider(loadAiConfig({ AI_PROVIDER: 'anthropic' }))).toThrow(
      AiConfigError,
    );
  });
});
