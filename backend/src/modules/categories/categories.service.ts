import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { CategoriesRepository } from './categories.repository';
import { Category, CategoryType } from './categories.types';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.schemas';

export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  findAll(tenantId: string, type?: CategoryType): Promise<Category[]> {
    if (type) return this.repo.findByType(tenantId, type);
    return this.repo.findActive(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<Category> {
    const category = await this.repo.findById(id, tenantId);
    if (!category || !category.active) {
      throw new AppError('Categoria não encontrada', 404, 'category.notFound');
    }
    return category;
  }

  async create(tenantId: string, input: CreateCategoryInput): Promise<Category> {
    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      tenantId,
      name: input.name,
      type: input.type,
      active: true,
      protected: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateCategoryInput, tenantId: string): Promise<Category> {
    const category = await this.findById(id, tenantId);
    if (category.protected && input.type && input.type !== category.type) {
      throw new AppError('Não é possível alterar o tipo desta categoria', 400, 'category.typeChangeNotAllowed');
    }
    return this.repo.update(id, { ...input, updatedAt: nowISO() }, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const category = await this.findById(id, tenantId);
    if (category.protected) {
      throw new AppError('Esta categoria é gerenciada pelo sistema e não pode ser excluída', 400, 'category.protected');
    }
    await this.repo.update(id, { active: false, updatedAt: nowISO() }, tenantId);
  }
}
