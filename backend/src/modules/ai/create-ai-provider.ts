import { AiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';
import { AiProvider } from './ai-provider.types';
import { FakeAiProvider } from './providers/fake-ai.provider';

/** Seleciona a implementação de AiProvider a partir da configuração (ADR 0002). */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'fake':
      return new FakeAiProvider();
    case 'anthropic':
      // Implementado na etapa de integração do provedor real.
      throw new AiConfigError('o provider "anthropic" ainda não está integrado; use AI_PROVIDER=fake');
  }
}
