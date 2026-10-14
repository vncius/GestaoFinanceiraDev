import { getDb } from '../../shared/persistence/mongo-client';
import { AuditLogEntry } from './audit-log.types';
import { encryptFields } from '../../shared/crypto/field-crypto';

// E-mail e IP identificam a pessoa: gravados criptografados (D8 do plano de
// segurança). O app nunca lê o log; consulta é feita direto no banco, com a
// chave, quando há incidente para investigar.
const ENCRYPTED = ['email', 'ip'] as const;

// Retenção curta o suficiente para não crescer sem limite no Atlas free tier
// (M0, 512MB). TTL index expira/apaga os documentos sozinho — não depende de
// nenhuma rotina de limpeza rodando.
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

let indexed = false;

export class AuditLogMongoRepository {
  private collection() {
    const collection = getDb().collection<AuditLogEntry>('audit_log');
    if (!indexed) {
      indexed = true;
      // Não aguarda: criação de índice não deve bloquear a primeira operação.
      collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS }).catch((err) => {
        console.error('[mongo] Falha ao criar índice TTL em audit_log:', err);
      });
    }
    return collection;
  }

  async insert(entry: AuditLogEntry): Promise<void> {
    await this.collection().insertOne(encryptFields({ ...entry }, ENCRYPTED) as never);
  }

  // Exclusão de conta: mantém ação/data/tenant para investigação, remove o
  // que identifica a pessoa.
  async anonymizeUser(userId: string): Promise<void> {
    await this.collection().updateMany(
      { userId } as never,
      { $set: { email: null, ip: null, userAgent: null } } as never,
    );
  }
}
