import { getDb } from '../../shared/persistence/mongo-client';
import { User } from './auth.types';

let indexed = false;

export class UsersMongoRepository {
  private collection() {
    const collection = getDb().collection<User>('users');
    if (!indexed) {
      indexed = true;
      // Não aguarda: criação de índice não deve bloquear a primeira operação.
      collection.createIndex({ email: 1 }, { unique: true }).catch((err) => {
        console.error('[mongo] Falha ao criar índice em users:', err);
      });
      // findById roda a cada requisição autenticada (checagem de sessão).
      collection.createIndex({ id: 1 }, { unique: true }).catch((err) => {
        console.error('[mongo] Falha ao criar índice em users:', err);
      });
    }
    return collection;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.collection().findOne({ email } as never, { projection: { _id: 0 } });
  }

  async findById(id: string): Promise<User | null> {
    return this.collection().findOne({ id } as never, { projection: { _id: 0 } });
  }

  async create(user: User): Promise<User> {
    await this.collection().insertOne({ ...user } as never);
    return user;
  }

  async incrementSessionVersion(id: string, updatedAt: string): Promise<void> {
    await this.collection().updateOne(
      { id } as never,
      { $inc: { sessionVersion: 1 }, $set: { updatedAt } } as never,
    );
  }

  async updateConsent(id: string, consentVersion: number, acceptedAt: string): Promise<void> {
    await this.collection().updateOne(
      { id } as never,
      { $set: { consentVersion, consentAcceptedAt: acceptedAt, updatedAt: acceptedAt } } as never,
    );
  }
}
