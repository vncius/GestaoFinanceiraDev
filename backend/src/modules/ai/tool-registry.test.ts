import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error';
import { AiToolCall } from './ai-provider.types';
import { AiTool, AiToolContext, AiToolErrorOutput } from './ai-tool.types';
import { AiConfigError } from './ai.errors';
import { AiToolRegistry, AiToolRunner } from './tool-registry';

const CONTEXT: AiToolContext = { tenantId: 'tenant-a', language: 'pt' };

function call(name: string, input: unknown, id = 'call_1'): AiToolCall {
  return { id, name, input };
}

interface EchoInput {
  text: string;
}

function makeEchoTool(overrides: Partial<AiTool<AiToolContext, EchoInput>> = {}) {
  return {
    name: 'echo',
    description: 'Repete o texto informado',
    kind: 'read' as const,
    inputSchema: z.object({ text: z.string().min(1) }),
    execute: async (input: EchoInput, context: AiToolContext) => ({
      echoed: input.text,
      tenantId: context.tenantId,
    }),
    ...overrides,
  };
}

describe('AiToolRegistry', () => {
  it('rejeita registro duplicado', () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    expect(() => registry.register(makeEchoTool())).toThrow(AiConfigError);
  });

  it('gera definições com JSON Schema derivado do Zod', () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    const [definition] = registry.definitions();
    expect(definition.name).toBe('echo');
    expect(definition.description).toBe('Repete o texto informado');
    expect(definition.inputSchema).toMatchObject({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    });
  });

  it('executa tool com sucesso', async () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    const result = await registry.execute(call('echo', { text: 'oi' }), CONTEXT);
    expect(result).toMatchObject({ ok: true, name: 'echo', toolCallId: 'call_1' });
    expect(result.output).toEqual({ echoed: 'oi', tenantId: 'tenant-a' });
  });

  it('devolve erro estruturado para tool desconhecida (sem lançar)', async () => {
    const registry = new AiToolRegistry();
    const result = await registry.execute(call('inexistente', {}), CONTEXT);
    expect(result.ok).toBe(false);
    expect((result.output as AiToolErrorOutput).code).toBe('ai.tool.unknown');
  });

  it('devolve erro de validação para argumentos inválidos', async () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    const result = await registry.execute(call('echo', { text: '' }), CONTEXT);
    expect(result.ok).toBe(false);
    const output = result.output as AiToolErrorOutput;
    expect(output.code).toBe('validation.generic');
    expect(output.details?.[0].field).toBe('text');
  });

  it('o contexto autenticado prevalece: tenantId nos argumentos é descartado', async () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    const result = await registry.execute(
      call('echo', { text: 'oi', tenantId: 'tenant-invasor' }),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    expect((result.output as { tenantId: string }).tenantId).toBe('tenant-a');
  });

  it('converte AppError da tool em erro estruturado com code i18n', async () => {
    const registry = new AiToolRegistry();
    registry.register(
      makeEchoTool({
        execute: async () => {
          throw new AppError('Ref inválida', 400, 'onboarding.draft.invalidRef', { ref: 'acc_9' });
        },
      }),
    );
    const result = await registry.execute(call('echo', { text: 'oi' }), CONTEXT);
    expect(result.ok).toBe(false);
    expect(result.output).toMatchObject({
      code: 'onboarding.draft.invalidRef',
      params: { ref: 'acc_9' },
    });
  });

  it('não vaza detalhes internos de erros inesperados', async () => {
    const registry = new AiToolRegistry();
    registry.register(
      makeEchoTool({
        execute: async () => {
          throw new Error('ECONNREFUSED mongodb://usuario:senha@host');
        },
      }),
    );
    const result = await registry.execute(call('echo', { text: 'oi' }), CONTEXT);
    expect(result.ok).toBe(false);
    const output = result.output as AiToolErrorOutput;
    expect(output.code).toBe('ai.tool.failed');
    expect(JSON.stringify(output)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(output)).not.toContain('senha');
  });
});

describe('AiToolRunner', () => {
  it('aplica o limite de tool calls do turno', async () => {
    const registry = new AiToolRegistry();
    registry.register(makeEchoTool());
    const runner = new AiToolRunner(registry, CONTEXT, 2);

    expect((await runner.run(call('echo', { text: 'a' }, 'c1'))).ok).toBe(true);
    expect((await runner.run(call('echo', { text: 'b' }, 'c2'))).ok).toBe(true);
    expect(runner.remaining).toBe(0);

    const third = await runner.run(call('echo', { text: 'c' }, 'c3'));
    expect(third.ok).toBe(false);
    expect((third.output as AiToolErrorOutput).code).toBe('ai.tool.limitExceeded');
  });

  it('tool desconhecida também consome orçamento (evita loop infinito de tentativas)', async () => {
    const registry = new AiToolRegistry();
    const runner = new AiToolRunner(registry, CONTEXT, 1);
    await runner.run(call('nada', {}));
    expect(runner.remaining).toBe(0);
  });
});
