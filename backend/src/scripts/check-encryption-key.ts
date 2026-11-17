// Confere, só lendo, se a ENCRYPTION_KEY configurada abre os campos
// criptografados do banco. Rodar antes de subir o app contra um banco
// existente: com a chave errada, as telas quebram e o login (que acha o
// usuário pelo índice cego do e-mail) criaria um usuário duplicado.
//
// Uso (variáveis só do arquivo indicado, sem o backend/.env):
//   npx tsx --env-file=CAMINHO/DO/.env src/scripts/check-encryption-key.ts
//
// Imprime só contagens, nunca valores. Sai com código 1 se algum campo falhar.
import { connectMongo, closeMongo } from '../shared/persistence/mongo-client';
import { assertEncryptionConfigured, decryptValue, isEncrypted } from '../shared/crypto/field-crypto';

const DOCS_PER_COLLECTION = 50;

function encryptedStrings(value: unknown, depth = 0): string[] {
  if (isEncrypted(value)) return [value as string];
  if (depth >= 2 || value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap((v) => encryptedStrings(v, depth + 1));
}

async function main() {
  if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY não definida.');
  assertEncryptionConfigured();
  const db = await connectMongo();
  console.log(`banco: ${db.databaseName}`);

  let total = 0;
  let failed = 0;
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find({}).limit(DOCS_PER_COLLECTION).toArray();
    for (const value of docs.flatMap((doc) => encryptedStrings(doc))) {
      total++;
      try {
        decryptValue(value);
      } catch {
        failed++;
      }
    }
  }

  console.log(`campos criptografados testados: ${total}, abriram: ${total - failed}, falharam: ${failed}`);
  if (total === 0) console.log('Nenhum campo criptografado encontrado (banco vazio ou sem criptografia).');
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: Error) => {
    console.error(`erro: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
