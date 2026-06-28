import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { AccountsRepository } from './accounts.repository';
import { Account, AccountType } from './accounts.types';

export class AccountsFileRepository implements AccountsRepository {
  private store = new JsonFileStore<Account>('accounts.json');

  findAll() {
    return this.store.findAll();
  }

  findById(id: string) {
    return this.store.findById(id);
  }

  create(data: Account) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Account>) {
    return this.store.update(id, data);
  }

  delete(id: string) {
    return this.store.delete(id);
  }

  async findActive() {
    const all = await this.store.findAll();
    return all.filter((a) => a.active);
  }

  async findByType(type: AccountType) {
    const all = await this.store.findAll();
    return all.filter((a) => a.type === type && a.active);
  }
}
