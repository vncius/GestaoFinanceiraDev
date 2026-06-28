import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';

export class SettingsFileRepository implements SettingsRepository {
  private store = new JsonFileStore<FinancialSettings>('settings.json');

  async get(): Promise<FinancialSettings | null> {
    const all = await this.store.findAll();
    return all[0] ?? null;
  }

  async upsert(data: FinancialSettings): Promise<FinancialSettings> {
    const existing = await this.get();
    if (existing) {
      return this.store.update(existing.id, data);
    }
    return this.store.create(data);
  }
}
