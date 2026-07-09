import { BaseRepository } from '../../shared/persistence/repository.types';
import { Account, AccountType } from './accounts.types';

export interface AccountsRepository extends BaseRepository<Account> {
  findActive(tenantId: string): Promise<Account[]>;
  findByType(tenantId: string, type: AccountType): Promise<Account[]>;
}
