import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { CategoriesRepository } from './categories.repository';
import { Category, CategoryType } from './categories.types';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.schemas';

export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  findAll(type?: CategoryType): Promise<Category[]> {
    if (type) return this.repo.findByType(type);
    return this.repo.findActive();
  }

  async findById(id: string): Promise<Category> {
    const category = await this.repo.findById(id);
    if (!category || !category.active) {
      throw new AppError('Categoria não encontrada', 404);
    }
    return category;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      name: input.name,
      type: input.type,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.findById(id);
    return this.repo.update(id, { ...input, updatedAt: nowISO() });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.repo.update(id, { active: false, updatedAt: nowISO() });
  }
}
