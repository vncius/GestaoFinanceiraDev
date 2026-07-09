import { BaseRepository } from '../../shared/persistence/repository.types';
import { Category, CategoryType } from './categories.types';

export interface CategoriesRepository extends BaseRepository<Category> {
  findActive(tenantId: string): Promise<Category[]>;
  findByType(tenantId: string, type: CategoryType): Promise<Category[]>;
}
