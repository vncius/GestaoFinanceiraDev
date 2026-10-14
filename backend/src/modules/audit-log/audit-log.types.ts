export type AuditLogAction = 'login' | 'login_failed' | 'logout' | 'logout_all';

export interface AuditLogEntry {
  tenantId: string | null;
  userId: string | null;
  email: string | null;
  action: AuditLogAction;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}
