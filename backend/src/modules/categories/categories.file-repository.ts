import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { CategoriesRepository } from './categories.repository';
import { Category, CategoryType } from './categories.types';

export class CategoriesFileRepository implements CategoriesRepository {
  private store = new JsonFileStore<Category>('categories.json');

  findAll() {
    return this.store.findAll();
  }

  findById(id: string) {
    return this.store.findById(id);
  }

  create(data: Category) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Category>) {
    return this.store.update(id, data);
  }

  delete(id: string) {
    return this.store.delete(id);
  }

  async findActive() {
    const all = await this.store.findAll();
    return all.filter((c) => c.active);
  }

  async findByType(type: CategoryType) {
    const all = await this.store.findAll();
    return all.filter((c) => c.type === type && c.active);
  }
}
