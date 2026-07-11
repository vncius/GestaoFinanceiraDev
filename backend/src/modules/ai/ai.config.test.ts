import { describe, expect, it } from 'vitest';
import { loadAiConfig } from './ai.config';
import { AiConfigError } from './ai.errors';

describe('loadAiConfig', () => {
  it('aplica defaults quando o env está vazio', () => {
    const config = loadAiConfig({});
    expect(config.provider).toBe('fake');
    expect(config.apiKey).toBe('');
    expect(config.model).toBe('');
    expect(config.maxOutputTokens).toBe(1024);
    expect(config.requestTimeoutMs).toBe(45_000);
    expect(config.maxToolRoundsPerTurn).toBe(8);
  });

  it('lê valores do env', () => {
    const config = loadAiConfig({
      AI_PROVIDER: 'anthropic',
      AI_API_KEY: 'sk-teste',
      AI_MODEL: 'modelo-x',
      AI_MAX_OUTPUT_TOKENS: '2048',
      AI_REQUEST_TIMEOUT_MS: '10000',
      AI_MAX_TOOL_ROUNDS: '4',
    });
    expect(config.provider).toBe('anthropic');
    expect(config.apiKey).toBe('sk-teste');
    expect(config.model).toBe('modelo-x');
    expect(config.maxOutputTokens).toBe(2048);
    expect(config.requestTimeoutMs).toBe(10_000);
    expect(config.maxToolRoundsPerTurn).toBe(4);
  });

  it('rejeita provider desconhecido', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'openai' })).toThrow(AiConfigError);
  });

  it('rejeita limites não numéricos ou não positivos', () => {
    expect(() => loadAiConfig({ AI_MAX_OUTPUT_TOKENS: 'abc' })).toThrow(AiConfigError);
    expect(() => loadAiConfig({ AI_REQUEST_TIMEOUT_MS: '-1' })).toThrow(AiConfigError);
    expect(() => loadAiConfig({ AI_MAX_TOOL_ROUNDS: '0' })).toThrow(AiConfigError);
  });
});
