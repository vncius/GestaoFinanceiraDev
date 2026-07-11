import { MongoStore } from '../../shared/persistence/mongo-store';
import { SettingsRepository } from './settings.repository';
import { FinancialSettings } from './settings.types';

export class SettingsMongoRepository implements SettingsRepository {
  private store = new MongoStore<FinancialSettings>('settings');

  async get(tenantId: string): Promise<FinancialSettings | null> {
    const all = await this.store.findAll(tenantId);
    return all[0] ?? null;
  }

  async upsert(data: FinancialSettings): Promise<FinancialSettings> {
    const existing = await this.get(data.tenantId);
    if (existing) {
      return this.store.update(existing.id, data, data.tenantId);
    }
    return this.store.create(data);
  }

  async deleteAll(tenantId: string): Promise<void> {
    await this.store.replaceAllForTenant(tenantId, []);
  }
}
