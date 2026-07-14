import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from './audit-log.service';
import { AuditLogMongoRepository } from './audit-log.mongo-repository';

describe('AuditLogService', () => {
  it('grava o evento com os campos informados e createdAt', async () => {
    const repo = { insert: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogMongoRepository;
    const service = new AuditLogService(repo);

    await service.record({
      action: 'login',
      tenantId: 'tenant-a',
      userId: 'user-1',
      email: 'a@b.com',
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        tenantId: 'tenant-a',
        userId: 'user-1',
        email: 'a@b.com',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        createdAt: expect.any(Date),
      }),
    );
  });

  it('preenche campos ausentes com null em vez de undefined', async () => {
    const repo = { insert: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogMongoRepository;
    const service = new AuditLogService(repo);

    await service.record({ action: 'login_failed' });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        userId: null,
        email: null,
        ip: null,
        userAgent: null,
      }),
    );
  });

  it('nunca propaga erro do repositório — login/logout não pode quebrar por causa da auditoria', async () => {
    const repo = { insert: vi.fn().mockRejectedValue(new Error('mongo indisponível')) } as unknown as AuditLogMongoRepository;
    const service = new AuditLogService(repo);

    await expect(service.record({ action: 'logout' })).resolves.toBeUndefined();
  });
});
