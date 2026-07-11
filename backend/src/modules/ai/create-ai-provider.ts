import { AiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { AiProvider } from './ai-provider.types';
import { FakeAiProvider } from './providers/fake-ai.provider';
import { AnthropicAiProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

/** Seleciona a implementação de AiProvider a partir da configuração (ADR 0002). */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'fake':
      return new FakeAiProvider();
    case 'anthropic':
      requireCredentials(config);
      return new AnthropicAiProvider(config);
    case 'openai':
      requireCredentials(config);
      return new OpenAiProvider(config);
  }
}

function requireCredentials(config: AiConfig): void {
  if (!config.apiKey) {
    throw new AiConfigError(`AI_API_KEY é obrigatória com AI_PROVIDER=${config.provider}`);
  }
  if (!config.model) {
    throw new AiConfigError(`AI_MODEL é obrigatório com AI_PROVIDER=${config.provider}`);
  }
}
