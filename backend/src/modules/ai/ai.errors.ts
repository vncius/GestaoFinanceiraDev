import { AppError } from '../../shared/errors/app-error';

// Erros da integração com IA. Herdam de AppError para fluir pelo errorHandler
// existente; os codes são chaves i18n resolvidas no frontend (namespace errors).

export class AiConfigError extends AppError {
  constructor(detail: string) {
    super(`Configuração de IA inválida: ${detail}`, 500, 'ai.notConfigured');
    this.name = 'AiConfigError';
  }
}

export class AiProviderUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super('Provedor de IA indisponível', 503, 'ai.providerUnavailable');
    this.name = 'AiProviderUnavailableError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class AiTimeoutError extends AppError {
  constructor() {
    super('Tempo limite excedido na chamada ao provedor de IA', 504, 'ai.timeout');
    this.name = 'AiTimeoutError';
  }
}

export class AiRateLimitedError extends AppError {
  constructor() {
    super('Limite de requisições ao provedor de IA excedido', 429, 'ai.rateLimited');
    this.name = 'AiRateLimitedError';
  }
}
