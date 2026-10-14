import { describe, expect, it, vi } from 'vitest';
import { AccountDeletionService, TenantDataEraser } from './account-deletion.service';
import { AuthService } from './auth.service';
import { UsersMongoRepository } from './users.mongo-repository';
import { AuditLogMongoRepository } from '../audit-log/audit-log.mongo-repository';

describe('AccountDeletionService', () => {
  it('apaga os dados do tenant, anonimiza a auditoria, apaga o usuário e esquece o cache — nessa ordem', async () => {
    const calls: string[] = [];
    const tenantData: TenantDataEraser = { resetTenant: vi.fn(async () => void calls.push('resetTenant')) };
    const usersRepo = { delete: vi.fn(async () => void calls.push('deleteUser')) } as unknown as UsersMongoRepository;
    const auditLogRepo = {
      anonymizeUser: vi.fn(async () => void calls.push('anonymize')),
    } as unknown as AuditLogMongoRepository;
    const authService = { forgetUser: vi.fn(() => void calls.push('forget')) } as unknown as AuthService;

    await new AccountDeletionService(tenantData, usersRepo, auditLogRepo, authService).deleteAccount('u1', 't1');

    expect(tenantData.resetTenant).toHaveBeenCalledWith('t1');
    expect(auditLogRepo.anonymizeUser).toHaveBeenCalledWith('u1');
    expect(usersRepo.delete).toHaveBeenCalledWith('u1');
    expect(authService.forgetUser).toHaveBeenCalledWith('u1');
    // Usuário por último: se algo falhar no meio, a pessoa ainda consegue
    // entrar e pedir a exclusão de novo.
    expect(calls).toEqual(['resetTenant', 'anonymize', 'deleteUser', 'forget']);
  });

  it('não apaga o usuário se apagar os dados falhar', async () => {
    const tenantData: TenantDataEraser = { resetTenant: vi.fn().mockRejectedValue(new Error('mongo fora')) };
    const usersRepo = { delete: vi.fn() } as unknown as UsersMongoRepository;
    const auditLogRepo = { anonymizeUser: vi.fn() } as unknown as AuditLogMongoRepository;
    const authService = { forgetUser: vi.fn() } as unknown as AuthService;

    await expect(
      new AccountDeletionService(tenantData, usersRepo, auditLogRepo, authService).deleteAccount('u1', 't1'),
    ).rejects.toThrow('mongo fora');
    expect(usersRepo.delete).not.toHaveBeenCalled();
  });
});
