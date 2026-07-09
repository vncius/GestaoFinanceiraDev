import { BaseRepository } from '../../shared/persistence/repository.types';
import { Account } from './accounts.types';

export interface AccountsRepository extends BaseRepository<Account> {
  findActive(tenantId: string): Promise<Account[]>;
}
