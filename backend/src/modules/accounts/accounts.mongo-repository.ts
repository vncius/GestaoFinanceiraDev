import { MongoStore } from '../../shared/persistence/mongo-store';
import { AccountsRepository } from './accounts.repository';
import { Account } from './accounts.types';

export class AccountsMongoRepository implements AccountsRepository {
  private store = new MongoStore<Account>('accounts');

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

  replaceAll(tenantId: string, items: Account[]) {
    return this.store.replaceAllForTenant(tenantId, items);
  }

  async findActive(tenantId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((a) => a.active);
  }
}
