import { BaseRepository } from '../../shared/persistence/repository.types';
import { Category, CategoryType } from './categories.types';

export interface CategoriesRepository extends BaseRepository<Category> {
  findActive(): Promise<Category[]>;
  findByType(type: CategoryType): Promise<Category[]>;
}
