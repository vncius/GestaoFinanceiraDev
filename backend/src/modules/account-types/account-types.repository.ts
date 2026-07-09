import { BaseRepository } from '../../shared/persistence/repository.types';
import { AccountType } from './account-types.types';

export interface AccountTypesRepository extends BaseRepository<AccountType> {
  findActive(tenantId: string): Promise<AccountType[]>;
}
