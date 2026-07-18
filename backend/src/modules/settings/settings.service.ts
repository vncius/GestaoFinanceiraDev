import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';
import { UpdateSettingsInput } from './settings.schemas';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';
import { AccountsRepository } from '../accounts/accounts.repository';

const DEFAULT_SETTINGS: Omit<FinancialSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> = {
  mainAccountId: null,
  minimumMainBalance: 0,
  annualRevenueLimit: 0,
  controlStartMonth: new Date().getMonth() + 1,
  controlStartYear: new Date().getFullYear(),
  pjLimitControlEnabled: false,
};

export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly categoriesRepo: CategoriesRepository,
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
    const updated = await this.repo.upsert({
      ...current,
      ...input,
      tenantId,
      updatedAt: nowISO(),
    });
    await this.syncNotaFiscalCategory(tenantId, updated.pjLimitControlEnabled);
    return updated;
  }

  private async syncNotaFiscalCategory(tenantId: string, enabled: boolean): Promise<void> {
    const categories = await this.categoriesRepo.findAll(tenantId);
    const notaFiscal = categories.find((c) => c.protected);
    const now = nowISO();

    if (enabled) {
      if (!notaFiscal) {
        await this.categoriesRepo.create({
          id: generateId(),
          tenantId,
          name: 'Nota Fiscal',
          type: CategoryType.INCOME,
          active: true,
          protected: true,
          createdAt: now,
          updatedAt: now,
        });
      } else if (!notaFiscal.active) {
        await this.categoriesRepo.update(notaFiscal.id, { active: true, updatedAt: now }, tenantId);
      }
    } else if (notaFiscal?.active) {
      await this.categoriesRepo.update(notaFiscal.id, { active: false, updatedAt: now }, tenantId);
    }
  }
}
