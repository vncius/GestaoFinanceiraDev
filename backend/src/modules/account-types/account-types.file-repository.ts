import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { AccountTypesRepository } from './account-types.repository';
import { AccountType } from './account-types.types';

export class AccountTypesFileRepository implements AccountTypesRepository {
  private store = new JsonFileStore<AccountType>('account-types.json');

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: AccountType) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<AccountType>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
  }

  replaceAll(tenantId: string, items: AccountType[]) {
    return this.store.replaceAllForTenant(tenantId, items);
  }

  async findActive(tenantId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((t) => t.active);
  }
}
