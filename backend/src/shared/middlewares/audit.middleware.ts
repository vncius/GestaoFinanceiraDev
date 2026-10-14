import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuditLogAction } from '../../modules/audit-log/audit-log.types';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';

// Trilha de auditoria das ações sobre os dados (S8 do plano de segurança).
// Grava depois que a resposta sai e só se deu certo (2xx): uma tentativa
// recusada pela validação não apagou nada. Nunca grava o corpo da requisição
// — só quem, quando, de onde e a rota.

function pathOf(req: Request): string {
  return req.originalUrl.split('?')[0];
}

function recordOnSuccess(
  auditLog: AuditLogService,
  req: Request,
  res: Response,
  action: AuditLogAction,
): void {
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void auditLog.record({
      action,
      tenantId: req.tenantId,
      userId: req.userId,
      ip: req.clientIp,
      userAgent: req.get('user-agent'),
      details: { method: req.method, path: pathOf(req) },
    });
  });
}

/** Middleware de rota: audita a ação quando a rota responder com sucesso. */
export function createAuditAction(auditLog: AuditLogService) {
  return (action: AuditLogAction): RequestHandler =>
    (req, res, next) => {
      recordOnSuccess(auditLog, req, res, action);
      next();
    };
}

/** Middleware global (após o authMiddleware): toda exclusão bem-sucedida vira `record_deleted`. */
export function createAuditDeletes(auditLog: AuditLogService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'DELETE') recordOnSuccess(auditLog, req, res, 'record_deleted');
    next();
  };
}
