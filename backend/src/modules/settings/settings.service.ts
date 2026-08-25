import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';
import { UpdateSettingsInput } from './settings.schemas';
import { AccountsRepository } from '../accounts/accounts.repository';

const DEFAULT_SETTINGS: Omit<FinancialSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> = {
  mainAccountId: null,
};

export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly accountsRepo: AccountsRepository,
  ) {}

  async get(tenantId: string): Promise<FinancialSettings> {
    const settings = await this.repo.get(tenantId);
    if (settings) return { ...DEFAULT_SETTINGS, ...settings };

    // cria configuração padrão se não existir
    const now = nowISO();
    return this.repo.upsert({
      ...DEFAULT_SETTINGS,
      id: generateId(),
      tenantId,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(tenantId: string, input: UpdateSettingsInput): Promise<FinancialSettings> {
    if (input.mainAccountId) {
      const account = await this.accountsRepo.findById(input.mainAccountId, tenantId);
      if (account?.autoReserveEnabled) {
        throw new AppError(
          'Esta conta já é usada como reserva e não pode ser marcada como conta principal. Escolha outra conta.',
          400,
          'account.mainReserveConflict',
        );
      }
    }
    const current = await this.get(tenantId);
    return this.repo.upsert({
      ...current,
      ...input,
      tenantId,
      updatedAt: nowISO(),
    });
  }
}
