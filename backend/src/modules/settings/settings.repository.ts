import { FinancialSettings } from './settings.types';

export interface SettingsRepository {
  get(): Promise<FinancialSettings | null>;
  upsert(data: FinancialSettings): Promise<FinancialSettings>;
}
