import { AuditLogMongoRepository } from './audit-log.mongo-repository';
import { AuditLogAction } from './audit-log.types';

export interface RecordAuditParams {
  action: AuditLogAction;
  tenantId?: string | null;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, string | number> | null;
}

export class AuditLogService {
  constructor(private readonly repo: AuditLogMongoRepository) {}

  // Auditoria nunca pode derrubar login/logout: falha aqui é logada e
  // engolida, não propagada para quem chamou.
  async record(params: RecordAuditParams): Promise<void> {
    try {
      await this.repo.insert({
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        email: params.email ?? null,
        action: params.action,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        details: params.details ?? null,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error('[audit-log] Falha ao gravar evento:', err);
    }
  }
}
