import { MongoStore } from '../../shared/persistence/mongo-store';
import { CategoriesRepository } from './categories.repository';
import { Category, CategoryType } from './categories.types';

export class CategoriesMongoRepository implements CategoriesRepository {
  private store = new MongoStore<Category>('categories');

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: Category) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Category>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
  }

  replaceAll(tenantId: string, items: Category[]) {
    return this.store.replaceAllForTenant(tenantId, items);
  }

  async findActive(tenantId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((c) => c.active);
  }

  async findByType(tenantId: string, type: CategoryType) {
    const all = await this.store.findAll(tenantId);
    return all.filter((c) => c.type === type && c.active);
  }
}
