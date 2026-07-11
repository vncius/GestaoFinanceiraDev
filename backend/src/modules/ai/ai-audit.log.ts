// Log estruturado de metadados de uso da IA — NUNCA conteúdo de conversa,
// valores financeiros ou identificadores de tenant/usuário (ai-security.md).
// Deliberadamente uma linha de console.log, não uma coleção/dashboard: métrica
// básica de latência e consumo, sem construir uma plataforma de observabilidade.

export interface AiAuditEntry {
  provider: string;
  turn: number;
  durationMs: number;
  tools: string[];
  outcome: 'ok' | 'error';
}

export function logAiAudit(entry: AiAuditEntry): void {
  console.log(
    `[ai-audit] provider=${entry.provider} turn=${entry.turn} durationMs=${Math.round(entry.durationMs)} tools=${entry.tools.join(',') || '-'} outcome=${entry.outcome}`,
  );
}
