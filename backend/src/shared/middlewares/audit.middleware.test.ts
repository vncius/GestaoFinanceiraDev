import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { createAuditAction, createAuditDeletes } from './audit.middleware';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';

function setup(method: string, statusCode: number) {
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const req = {
    method,
    originalUrl: '/cash-flow/payments/abc?scope=CURRENT',
    tenantId: 'tenant-1',
    userId: 'user-1',
    clientIp: '203.0.113.7',
    get: () => 'vitest',
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;
  return { auditLog, req, res };
}

describe('auditoria de ações sobre os dados', () => {
  it('grava exclusão bem-sucedida com rota sem query string', () => {
    const { auditLog, req, res } = setup('DELETE', 204);
    const next = vi.fn();
    createAuditDeletes(auditLog)(req, res, next);
    expect(next).toHaveBeenCalled();
    (res as unknown as EventEmitter).emit('finish');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'record_deleted',
        tenantId: 'tenant-1',
        userId: 'user-1',
        ip: '203.0.113.7',
        details: { method: 'DELETE', path: '/cash-flow/payments/abc' },
      }),
    );
  });

  it('não grava exclusão que falhou', () => {
    const { auditLog, req, res } = setup('DELETE', 404);
    createAuditDeletes(auditLog)(req, res, vi.fn());
    (res as unknown as EventEmitter).emit('finish');
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('ignora métodos que não são DELETE', () => {
    const { auditLog, req, res } = setup('POST', 201);
    createAuditDeletes(auditLog)(req, res, vi.fn());
    (res as unknown as EventEmitter).emit('finish');
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('ação nomeada de rota grava quando a rota responde 2xx', () => {
    const { auditLog, req, res } = setup('POST', 200);
    createAuditAction(auditLog)('data_reset')(req, res, vi.fn());
    (res as unknown as EventEmitter).emit('finish');
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'data_reset' }));
  });

  it('ação nomeada acrescenta os detalhes extras da rota', () => {
    const { auditLog, req, res } = setup('GET', 200);
    createAuditAction(auditLog)('statement_exported', () => ({ format: 'json', month: 10 }))(req, res, vi.fn());
    (res as unknown as EventEmitter).emit('finish');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'statement_exported',
        details: { method: 'GET', path: '/cash-flow/payments/abc', format: 'json', month: 10 },
      }),
    );
  });
});
