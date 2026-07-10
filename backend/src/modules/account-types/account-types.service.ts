import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountTypesRepository } from './account-types.repository';
import { AccountType } from './account-types.types';
import { CreateAccountTypeInput, UpdateAccountTypeInput } from './account-types.schemas';

export class AccountTypesService {
  constructor(private readonly repo: AccountTypesRepository) {}

  findAll(tenantId: string): Promise<AccountType[]> {
    return this.repo.findActive(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<AccountType> {
    const accountType = await this.repo.findById(id, tenantId);
    if (!accountType || !accountType.active) {
      throw new AppError('Tipo de conta não encontrado', 404, 'accountType.notFound');
    }
    return accountType;
  }

  async create(tenantId: string, input: CreateAccountTypeInput): Promise<AccountType> {
    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      tenantId,
      name: input.name,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateAccountTypeInput, tenantId: string): Promise<AccountType> {
    await this.findById(id, tenantId);
    return this.repo.update(id, { ...input, updatedAt: nowISO() }, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.update(id, { active: false, updatedAt: nowISO() }, tenantId);
  }
}
