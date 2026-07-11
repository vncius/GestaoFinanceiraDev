import { AiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { AiProvider } from './ai-provider.types';
import { FakeAiProvider } from './providers/fake-ai.provider';
import { AnthropicAiProvider } from './providers/anthropic.provider';

/** Seleciona a implementação de AiProvider a partir da configuração (ADR 0002). */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'fake':
      return new FakeAiProvider();
    case 'anthropic':
      if (!config.apiKey) {
        throw new AiConfigError('AI_API_KEY é obrigatória com AI_PROVIDER=anthropic');
      }
      if (!config.model) {
        throw new AiConfigError('AI_MODEL é obrigatório com AI_PROVIDER=anthropic');
      }
      return new AnthropicAiProvider(config);
  }
}
