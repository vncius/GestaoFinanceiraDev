import { AiConfigError } from './ai.errors';

export type AiProviderName = 'fake' | 'anthropic';

export interface AiConfig {
  provider: AiProviderName;
  /** Chave do provedor real. Existe apenas no backend; nunca logar nem expor. */
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  /** Teto de rodadas de tool calls dentro de um único turno de conversa. */
  maxToolRoundsPerTurn: number;
}

const DEFAULTS = {
  // 'fake' como default mantém o boot do servidor independente de credenciais;
  // o provedor real é ativado explicitamente com AI_PROVIDER=anthropic.
  provider: 'fake' as AiProviderName,
  model: 'claude-opus-4-8',
  maxOutputTokens: 1024,
  requestTimeoutMs: 45_000,
  maxToolRoundsPerTurn: 8,
};

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AiConfigError(`${name} deve ser um inteiro positivo, recebido "${raw}"`);
  }
  return value;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = (env.AI_PROVIDER ?? DEFAULTS.provider) as AiProviderName;
  if (provider !== 'fake' && provider !== 'anthropic') {
    throw new AiConfigError(`AI_PROVIDER desconhecido: "${env.AI_PROVIDER}"`);
  }

  return {
    provider,
    apiKey: env.AI_API_KEY ?? '',
    model: env.AI_MODEL ?? DEFAULTS.model,
    maxOutputTokens: parsePositiveInt('AI_MAX_OUTPUT_TOKENS', env.AI_MAX_OUTPUT_TOKENS, DEFAULTS.maxOutputTokens),
    requestTimeoutMs: parsePositiveInt('AI_REQUEST_TIMEOUT_MS', env.AI_REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
    maxToolRoundsPerTurn: parsePositiveInt(
      'AI_MAX_TOOL_ROUNDS',
      env.AI_MAX_TOOL_ROUNDS,
      DEFAULTS.maxToolRoundsPerTurn,
    ),
  };
}
