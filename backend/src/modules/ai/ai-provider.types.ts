// Contratos neutros de comunicação com provedores de IA (ADR 0002).
// Nenhum tipo aqui pode referenciar SDKs de provedores; a tradução para o
// formato específico acontece somente dentro de cada implementação em
// providers/.

/** Chamada de tool solicitada pelo modelo. */
export interface AiToolCall {
  /** Identificador da chamada dentro do turno, gerado pelo provedor. */
  id: string;
  name: string;
  /** Argumentos já desserializados. A validação (Zod) é responsabilidade de quem executa. */
  input: unknown;
}

/** Mensagens trocadas com o modelo, no formato neutro da aplicação. */
export type AiMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] }
  | { role: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

/** Tool anunciada ao modelo. O inputSchema é JSON Schema (derivado de Zod no domínio). */
export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiChatRequest {
  system: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  maxOutputTokens: number;
  /** Cancelamento/timeout controlado por quem chama. */
  signal?: AbortSignal;
}

export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens';

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiChatResult {
  /** Texto da resposta; pode ser vazio quando o turno contém apenas tool calls. */
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  usage?: AiUsage;
}

/**
 * Contrato único que os serviços de domínio conhecem. Implementações:
 * providers/fake-ai.provider.ts (testes) e, futuramente, o provedor real.
 */
export interface AiProvider {
  readonly name: string;
  chat(request: AiChatRequest): Promise<AiChatResult>;
}
