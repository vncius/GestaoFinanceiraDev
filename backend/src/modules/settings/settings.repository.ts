import { FinancialSettings } from './settings.types';

export interface SettingsRepository {
  get(tenantId: string): Promise<FinancialSettings | null>;
  upsert(data: FinancialSettings): Promise<FinancialSettings>;
  deleteAll(tenantId: string): Promise<void>;
}
