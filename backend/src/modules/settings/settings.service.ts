import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';
import { UpdateSettingsInput } from './settings.schemas';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';

const DEFAULT_SETTINGS: Omit<FinancialSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  defaultReservePercentage: 30,
  applyReserveByDefault: true,
  allowDisableReserve: true,
  mainAccountId: null,
  emergencyReserveAccountId: null,
  minimumMainBalance: 0,
  annualRevenueLimit: 0,
  controlStartMonth: new Date().getMonth() + 1,
  controlStartYear: new Date().getFullYear(),
  pjLimitControlEnabled: true,
};

export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly categoriesRepo: CategoriesRepository,
  ) {}

  async get(): Promise<FinancialSettings> {
    const settings = await this.repo.get();
    if (settings) return { ...DEFAULT_SETTINGS, ...settings };

    // cria configuração padrão se não existir
    const now = nowISO();
    return this.repo.upsert({
      id: generateId(),
      ...DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(input: UpdateSettingsInput): Promise<FinancialSettings> {
    const current = await this.get();
    const updated = await this.repo.upsert({
      ...current,
      ...input,
      updatedAt: nowISO(),
    });
    await this.syncNotaFiscalCategory(updated.pjLimitControlEnabled);
    return updated;
  }

  private async syncNotaFiscalCategory(enabled: boolean): Promise<void> {
    const categories = await this.categoriesRepo.findAll();
    const notaFiscal = categories.find((c) => c.protected);
    const now = nowISO();

    if (enabled) {
      if (!notaFiscal) {
        await this.categoriesRepo.create({
          id: generateId(),
          name: 'Nota Fiscal',
          type: CategoryType.INCOME,
          active: true,
          protected: true,
          createdAt: now,
          updatedAt: now,
        });
      } else if (!notaFiscal.active) {
        await this.categoriesRepo.update(notaFiscal.id, { active: true, updatedAt: now });
      }
    } else if (notaFiscal?.active) {
      await this.categoriesRepo.update(notaFiscal.id, { active: false, updatedAt: now });
    }
  }
}
