import { ZodError, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// O tipo de retorno de zodToJsonSchema é um condicional profundo que estoura o
// limite de instanciação do TS quando parametrizado; o contrato aqui é só
// "JSON Schema como objeto", então apagamos o genérico na fronteira.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options?: { $refStrategy?: 'none' },
) => Record<string, unknown>;
import { AppError } from '../../shared/errors/app-error';
import { AiToolCall, AiToolDefinition } from './ai-provider.types';
import { AiTool, AiToolContext, AiToolErrorOutput, AiToolResult } from './ai-tool.types';
import { AiConfigError } from './ai.errors';

/**
 * Lista fechada de tools de um fluxo (ex.: onboarding). O modelo só consegue
 * invocar o que foi registrado aqui; resolução é sempre por nome exato.
 */
export class AiToolRegistry<TContext extends AiToolContext = AiToolContext> {
  private readonly tools = new Map<string, AiTool<TContext, never>>();

  register<TInput>(tool: AiTool<TContext, TInput>): void {
    if (this.tools.has(tool.name)) {
      throw new AiConfigError(`tool duplicada: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as AiTool<TContext, never>);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** Definições anunciadas ao modelo, derivadas dos schemas Zod. */
  definitions(): AiToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toJsonSchema(tool.inputSchema as ZodTypeAny, { $refStrategy: 'none' }),
    }));
  }

  /**
   * Executa uma tool call do modelo. Nunca lança: qualquer falha vira um
   * resultado estruturado (ok: false) devolvido ao modelo para autocorreção.
   */
  async execute(call: AiToolCall, context: TContext): Promise<AiToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return errorResult(call, {
        code: 'ai.tool.unknown',
        message: `Tool desconhecida: ${call.name}`,
        params: { name: call.name },
      });
    }

    const parsed = tool.inputSchema.safeParse(call.input ?? {});
    if (!parsed.success) {
      return errorResult(call, zodErrorOutput(parsed.error));
    }

    try {
      const output = await tool.execute(parsed.data as never, context);
      return { toolCallId: call.id, name: call.name, ok: true, output };
    } catch (error) {
      return errorResult(call, executionErrorOutput(error));
    }
  }
}

/**
 * Orçamento de tool calls de um turno de conversa. Compartilhado entre as
 * rodadas do loop; excedeu, a tool não executa e o modelo é informado.
 */
export class AiToolRunner<TContext extends AiToolContext = AiToolContext> {
  private callsUsed = 0;

  constructor(
    private readonly registry: AiToolRegistry<TContext>,
    private readonly context: TContext,
    private readonly maxCalls: number,
  ) {}

  get remaining(): number {
    return Math.max(0, this.maxCalls - this.callsUsed);
  }

  async run(call: AiToolCall): Promise<AiToolResult> {
    if (this.callsUsed >= this.maxCalls) {
      return errorResult(call, {
        code: 'ai.tool.limitExceeded',
        message: `Limite de ${this.maxCalls} tool calls por turno atingido`,
        params: { maxCalls: this.maxCalls },
      });
    }
    this.callsUsed += 1;
    return this.registry.execute(call, this.context);
  }
}

function errorResult(call: AiToolCall, output: AiToolErrorOutput): AiToolResult {
  return { toolCallId: call.id, name: call.name, ok: false, output };
}

function zodErrorOutput(error: ZodError): AiToolErrorOutput {
  return {
    code: 'validation.generic',
    message: 'Argumentos inválidos',
    details: error.errors.map((e) => ({ field: e.path.join('.'), code: e.message })),
  };
}

function executionErrorOutput(error: unknown): AiToolErrorOutput {
  if (error instanceof AppError) {
    return { code: error.code ?? 'ai.tool.failed', message: error.message, params: error.params };
  }
  if (error instanceof ZodError) {
    return zodErrorOutput(error);
  }
  // Nunca vazar detalhes internos (stack, mensagens de driver etc.) ao modelo.
  return { code: 'ai.tool.failed', message: 'Falha interna ao executar a tool' };
}
