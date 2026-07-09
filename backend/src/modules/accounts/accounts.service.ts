import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from './accounts.repository';
import { Account } from './accounts.types';
import { CreateAccountInput, UpdateAccountInput } from './accounts.schemas';

export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  findAll(tenantId: string): Promise<Account[]> {
    return this.repo.findActive(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<Account> {
    const account = await this.repo.findById(id, tenantId);
    if (!account || !account.active) {
      throw new AppError('Conta não encontrada', 404);
    }
    return account;
  }

  async create(tenantId: string, input: CreateAccountInput): Promise<Account> {
    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      tenantId,
      name: input.name,
      accountTypeId: input.accountTypeId ?? null,
      initialBalance: input.initialBalance ?? 0,
      initialBalanceDate: input.initialBalanceDate ?? now,
      active: true,
      autoReserveEnabled: input.autoReserveEnabled ?? false,
      autoReservePercentage: input.autoReservePercentage ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateAccountInput, tenantId: string): Promise<Account> {
    await this.findById(id, tenantId);
    return this.repo.update(id, { ...input, updatedAt: nowISO() }, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.update(id, { active: false, updatedAt: nowISO() }, tenantId);
  }
}
