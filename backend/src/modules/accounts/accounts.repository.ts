import { BaseRepository } from '../../shared/persistence/repository.types';
import { Account, AccountType } from './accounts.types';

export interface AccountsRepository extends BaseRepository<Account> {
  findActive(): Promise<Account[]>;
  findByType(type: AccountType): Promise<Account[]>;
}
