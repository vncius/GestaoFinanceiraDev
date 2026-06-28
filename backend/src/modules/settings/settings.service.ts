import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';
import { UpdateSettingsInput } from './settings.schemas';

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
};

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get(): Promise<FinancialSettings> {
    const settings = await this.repo.get();
    if (settings) return settings;

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
    return this.repo.upsert({
      ...current,
      ...input,
      updatedAt: nowISO(),
    });
  }
}
