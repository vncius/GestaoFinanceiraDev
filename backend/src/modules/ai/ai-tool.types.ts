import { ZodSchema } from 'zod';

/**
 * Contexto de execução de tools, montado EXCLUSIVAMENTE pelo backend a partir
 * da requisição autenticada. O modelo nunca fornece nem altera nada daqui —
 * argumentos de tool contendo tenantId/userId são descartados pela validação
 * (schemas z.object removem chaves desconhecidas). Domínios estendem este
 * contexto com o que suas tools precisam (ex.: draft do onboarding).
 */
export interface AiToolContext {
  tenantId: string;
  /** Idioma da conversa (pt/en/es) para mensagens geradas por tools. */
  language: string;
}

/**
 * Tool invocável pelo modelo (ADR 0003):
 * - 'read'      → consulta contexto autorizado do tenant; não altera nada;
 * - 'proposal'  → altera apenas o draft/estado do fluxo, nunca dados financeiros.
 */
export type AiToolKind = 'read' | 'proposal';

export interface AiTool<TContext extends AiToolContext = AiToolContext, TInput = unknown> {
  name: string;
  /** Descrição anunciada ao modelo — parte do prompt; sem dados sensíveis. */
  description: string;
  kind: AiToolKind;
  /** Valida os argumentos e é a fonte do JSON Schema anunciado ao modelo. */
  inputSchema: ZodSchema<TInput>;
  execute(input: TInput, context: TContext): Promise<unknown>;
}

/**
 * Resultado devolvido ao modelo. Erros voltam estruturados (ok: false) em vez
 * de exceção — o modelo tem a chance de se autocorrigir sem quebrar o turno.
 */
export interface AiToolResult {
  toolCallId: string;
  name: string;
  ok: boolean;
  output: unknown;
}

/** Formato do output quando ok === false. */
export interface AiToolErrorOutput {
  code: string;
  message: string;
  params?: Record<string, string | number>;
  details?: Array<{ field: string; code: string }>;
}
