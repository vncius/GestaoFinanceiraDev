import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { AccountsRepository } from './accounts.repository';
import { Account, AccountType } from './accounts.types';

export class AccountsFileRepository implements AccountsRepository {
  private store = new JsonFileStore<Account>('accounts.json');

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: Account) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Account>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
  }

  async findActive(tenantId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((a) => a.active);
  }

  async findByType(tenantId: string, type: AccountType) {
    const all = await this.store.findAll(tenantId);
    return all.filter((a) => a.type === type && a.active);
  }
}
