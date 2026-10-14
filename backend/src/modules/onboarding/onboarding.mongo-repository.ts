import { MongoStore } from '../../shared/persistence/mongo-store';
import { OnboardingMessagesRepository, OnboardingStateRepository } from './onboarding.repository';
import { OnboardingMessage, OnboardingState } from './onboarding.types';

export class OnboardingStateMongoRepository implements OnboardingStateRepository {
  private store = new MongoStore<OnboardingState>('onboarding_states', [], {
    encryptedFields: ['conversationSummary'],
  });

  async get(tenantId: string): Promise<OnboardingState | null> {
    const all = await this.store.findAll(tenantId);
    return all[0] ?? null;
  }

  async upsert(data: OnboardingState): Promise<OnboardingState> {
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

export class OnboardingMessagesMongoRepository implements OnboardingMessagesRepository {
  private store = new MongoStore<OnboardingMessage>('onboarding_messages', [], {
    encryptedFields: ['content'],
  });

  async findAll(tenantId: string): Promise<OnboardingMessage[]> {
    const all = await this.store.findAll(tenantId);
    return all.sort((a, b) => a.turn - b.turn || a.createdAt.localeCompare(b.createdAt));
  }

  async create(data: OnboardingMessage): Promise<OnboardingMessage> {
    return this.store.create(data);
  }

  async deleteAll(tenantId: string): Promise<void> {
    await this.store.replaceAllForTenant(tenantId, []);
  }
}
