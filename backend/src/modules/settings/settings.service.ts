import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';
import { UpdateSettingsInput } from './settings.schemas';

const DEFAULT_SETTINGS: Omit<FinancialSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> = {
  dashboardScope: 'CONSOLIDATED',
};

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

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
    const current = await this.get(tenantId);
    return this.repo.upsert({
      ...current,
      ...input,
      tenantId,
      updatedAt: nowISO(),
    });
  }
}
