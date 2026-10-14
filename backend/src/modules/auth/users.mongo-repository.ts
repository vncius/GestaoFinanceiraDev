import { getDb } from '../../shared/persistence/mongo-client';
import { blindIndex, decryptFields, encryptFields } from '../../shared/crypto/field-crypto';
import { User } from './auth.types';

// E-mail e nome ficam criptografados (D8 do plano de segurança). Como cifra
// não serve para busca, o login acha o usuário por `emailHash` — HMAC do
// e-mail normalizado (índice cego). O campo só existe no banco: os
// métodos daqui devolvem o User legível, sem ele.
const ENCRYPTED: (keyof User)[] = ['email', 'name'];

type UserDoc = User & { emailHash?: string };

let indexed = false;

function toDb(user: User): UserDoc {
  return { ...encryptFields(user, ENCRYPTED), emailHash: blindIndex(user.email) };
}

function fromDb(doc: UserDoc | null): User | null {
  if (!doc) return null;
  const { emailHash: _ignored, ...user } = doc;
  return decryptFields(user, ENCRYPTED);
}

export class UsersMongoRepository {
  private collection() {
    const collection = getDb().collection<UserDoc>('users');
    if (!indexed) {
      indexed = true;
      // Não aguarda: criação de índice não deve bloquear a primeira operação.
      // Parcial: usuários antigos ainda sem emailHash (antes da migração de
      // boot) não colidem entre si como "null duplicado".
      collection
        .createIndex(
          { emailHash: 1 },
          { unique: true, partialFilterExpression: { emailHash: { $exists: true } } },
        )
        .catch((err) => {
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
    // `email` em texto puro cobre usuários gravados antes da criptografia,
    // caso a migração de boot ainda não tenha passado por eles.
    const doc = await this.collection().findOne(
      { $or: [{ emailHash: blindIndex(email) }, { email }] } as never,
      { projection: { _id: 0 } },
    );
    return fromDb(doc as UserDoc | null);
  }

  async findById(id: string): Promise<User | null> {
    const doc = await this.collection().findOne({ id } as never, { projection: { _id: 0 } });
    return fromDb(doc as UserDoc | null);
  }

  async create(user: User): Promise<User> {
    await this.collection().insertOne(toDb(user) as never);
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

  async delete(id: string): Promise<void> {
    await this.collection().deleteOne({ id } as never);
  }
}
