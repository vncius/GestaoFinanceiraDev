import { AnyBulkWriteOperation, Document } from 'mongodb';
import { getDb } from '../persistence/mongo-client';
import {
  blindIndex,
  decryptValue,
  encryptValue,
  isEncryptionEnabled,
} from '../crypto/field-crypto';

// Migração de boot da S12 (D8 do plano de segurança): criptografa os campos
// sensíveis que ainda estejam em texto puro e mantém o índice cego do e-mail
// dos usuários em dia. Idempotente — valores já com prefixo "enc:v1:" são
// ignorados, então pode rodar a cada boot.

// Precisa bater com os encryptedFields dos repositórios.
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  financial_transactions: ['description', 'notes'],
  credit_card_entries: ['description', 'notes'],
  onboarding_messages: ['content'],
  onboarding_states: ['conversationSummary'],
  users: ['email', 'name'],
  audit_log: ['email', 'ip'],
};

const BATCH = 500;
const PLAIN = { $type: 'string', $not: /^enc:v1:/ };

async function encryptCollection(name: string, fields: readonly string[]): Promise<number> {
  const collection = getDb().collection(name);
  const cursor = collection.find(
    { $or: fields.map((f) => ({ [f]: PLAIN })) },
    { projection: Object.fromEntries(fields.map((f) => [f, 1])) },
  );
  let ops: AnyBulkWriteOperation<Document>[] = [];
  let total = 0;
  for await (const doc of cursor) {
    const set: Record<string, string> = {};
    for (const f of fields) {
      if (typeof doc[f] === 'string') set[f] = encryptValue(doc[f]);
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    if (ops.length >= BATCH) {
      await collection.bulkWrite(ops, { ordered: false });
      total += ops.length;
      ops = [];
    }
  }
  if (ops.length) {
    await collection.bulkWrite(ops, { ordered: false });
    total += ops.length;
  }
  return total;
}

// Recalcula sempre (não só quando falta): se a chave for configurada depois
// (dev sem chave → com chave), o HMAC muda e o login deixaria de achar o
// usuário — e criaria outro tenant para a mesma pessoa.
async function refreshEmailHashes(): Promise<number> {
  const users = getDb().collection('users');
  const ops: AnyBulkWriteOperation<Document>[] = [];
  for await (const u of users.find({}, { projection: { email: 1, emailHash: 1 } })) {
    if (typeof u.email !== 'string') continue;
    const expected = blindIndex(decryptValue(u.email));
    if (u.emailHash !== expected) {
      ops.push({ updateOne: { filter: { _id: u._id }, update: { $set: { emailHash: expected } } } });
    }
  }
  if (ops.length) await users.bulkWrite(ops, { ordered: false });
  return ops.length;
}

export async function migrateEncryptFields(): Promise<void> {
  const hashes = await refreshEmailHashes();
  if (hashes) console.log(`[migration] Índice cego de e-mail atualizado em ${hashes} usuário(s).`);

  if (!isEncryptionEnabled()) {
    console.warn('[migration] ENCRYPTION_KEY ausente — campos sensíveis ficam em texto puro (só aceitável em dev).');
    return;
  }
  for (const [name, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    const count = await encryptCollection(name, fields);
    if (count) console.log(`[migration] ${count} documento(s) criptografado(s) em ${name}.`);
  }
}
