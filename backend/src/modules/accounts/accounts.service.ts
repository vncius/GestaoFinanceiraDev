import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from './accounts.repository';
import { Account } from './accounts.types';
import { CreateAccountInput, UpdateAccountInput } from './accounts.schemas';

export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  findAll(): Promise<Account[]> {
    return this.repo.findActive();
  }

  async findById(id: string): Promise<Account> {
    const account = await this.repo.findById(id);
    if (!account || !account.active) {
      throw new AppError('Conta não encontrada', 404);
    }
    return account;
  }

  async create(input: CreateAccountInput): Promise<Account> {
    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance ?? 0,
      initialBalanceDate: input.initialBalanceDate ?? now,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    await this.findById(id);
    return this.repo.update(id, { ...input, updatedAt: nowISO() });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.repo.update(id, { active: false, updatedAt: nowISO() });
  }
}
