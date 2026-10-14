import { AuthService } from './auth.service';
import { UsersMongoRepository } from './users.mongo-repository';
import { AuditLogMongoRepository } from '../audit-log/audit-log.mongo-repository';

/** O que a exclusão precisa do módulo de backup: apagar todos os dados do tenant. */
export interface TenantDataEraser {
  resetTenant(tenantId: string): Promise<void>;
}

// Exclusão completa da conta (D7 do plano de segurança — direito de
// eliminação da LGPD, art. 18, VI). Apaga todos os dados do tenant e o
// usuário; o log de auditoria do usuário perde e-mail, IP e navegador (fica
// só ação + data, para investigação de incidentes dentro da retenção de 90
// dias). Sessões abertas em outros aparelhos deixam de valer na hora:
// verifySession não encontra mais o usuário.
export class AccountDeletionService {
  constructor(
    private readonly tenantData: TenantDataEraser,
    private readonly usersRepo: UsersMongoRepository,
    private readonly auditLogRepo: AuditLogMongoRepository,
    private readonly authService: AuthService,
  ) {}

  async deleteAccount(userId: string, tenantId: string): Promise<void> {
    await this.tenantData.resetTenant(tenantId);
    await this.auditLogRepo.anonymizeUser(userId);
    await this.usersRepo.delete(userId);
    this.authService.forgetUser(userId);
  }
}
