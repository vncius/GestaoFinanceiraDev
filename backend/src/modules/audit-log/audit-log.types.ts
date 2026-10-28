export type AuditLogAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'consent_accepted'
  | 'account_deleted'
  // Ações sobre os dados (S8 do plano de segurança): o que apaga, substitui
  // em massa ou tira dados do sistema.
  | 'record_deleted'
  | 'data_reset'
  | 'backup_imported'
  | 'backup_exported'
  | 'csv_exported'
  // Relatório do extrato (plano do relatório): details traz formato, mês e escopo.
  | 'statement_exported'
  | 'statement_imported'
  | 'invoice_imported';

export interface AuditLogEntry {
  tenantId: string | null;
  userId: string | null;
  email: string | null;
  action: AuditLogAction;
  ip: string | null;
  userAgent: string | null;
  /** Contexto da ação (ex.: rota do registro excluído). Nunca dados financeiros. */
  details: Record<string, string | number> | null;
  createdAt: Date;
}
