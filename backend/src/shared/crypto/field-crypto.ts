import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Criptografia de campos sensíveis em repouso (D8 do plano de segurança).
//
// - AES-256-GCM, IV aleatório por valor: o mesmo texto gera cifras
//   diferentes, então campo criptografado não serve para busca/igualdade no
//   banco — por isso só criptografamos campos filtrados em memória.
// - Formato: "enc:v1:" + base64(iv[12] | tag[16] | cifra). O prefixo permite
//   conviver com valores antigos em texto puro (lidos como estão) e torna a
//   migração idempotente.
// - Índice cego (blindIndex): HMAC do valor normalizado, para achar o
//   usuário pelo e-mail sem guardar o e-mail legível.
// - Chave: ENCRYPTION_KEY (32 bytes em base64). Duas subchaves derivadas por
//   HKDF (cifra e índice), para não reutilizar a mesma chave em dois usos.
//   Sem a chave (dev/testes), os valores ficam em texto puro; em produção o
//   servidor não sobe sem ela (assertEncryptionConfigured).
//
// PERDER A CHAVE = PERDER OS DADOS CRIPTOGRAFADOS. Guardar cópia segura.

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

interface Keys {
  enc: Buffer;
  mac: Buffer;
}

let cachedSource: string | undefined | null = null;
let cachedKeys: Keys | null = null;

function derive(master: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
}

function loadKeys(): Keys | null {
  const source = process.env.ENCRYPTION_KEY;
  if (source === cachedSource) return cachedKeys;
  cachedSource = source;
  if (!source) {
    cachedKeys = null;
    return null;
  }
  const master = Buffer.from(source, 'base64');
  if (master.length !== 32) {
    throw new Error('ENCRYPTION_KEY precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32).');
  }
  cachedKeys = { enc: derive(master, 'gf-field-enc-v1'), mac: derive(master, 'gf-blind-index-v1') };
  return cachedKeys;
}

// Sem chave, o índice cego ainda precisa ser determinístico para o login
// funcionar em dev; essa chave fixa não protege nada (nem precisa).
const DEV_MAC_KEY = Buffer.from('gf-dev-blind-index-sem-protecao');

export function isEncryptionEnabled(): boolean {
  return loadKeys() !== null;
}

/** Falha cedo (no boot) se produção estiver sem chave ou com chave inválida. */
export function assertEncryptionConfigured(): void {
  const keys = loadKeys(); // valida o formato, se houver chave
  if (!keys && process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY não configurada. Em produção ela é obrigatória (openssl rand -base64 32).');
  }
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptValue(value: string): string {
  const keys = loadKeys();
  if (!keys || isEncrypted(value)) return value;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keys.enc, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptValue(value: string): string {
  if (!isEncrypted(value)) return value;
  const keys = loadKeys();
  if (!keys) throw new Error('Dado criptografado no banco, mas ENCRYPTION_KEY não está configurada.');
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  // authTagLength explícito: sem ele o Node aceitaria uma tag truncada, o que
  // facilita forjar um valor que passe na verificação.
  const decipher = createDecipheriv('aes-256-gcm', keys.enc, raw.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** HMAC determinístico do valor normalizado (minúsculas, sem espaços nas pontas). */
export function blindIndex(value: string): string {
  const key = loadKeys()?.mac ?? DEV_MAC_KEY;
  return createHmac('sha256', key).update(value.trim().toLowerCase()).digest('hex');
}

/** Cópia do objeto com os campos indicados criptografados (só strings). */
export function encryptFields<T extends object>(obj: T, fields: readonly string[]): T {
  if (fields.length === 0 || !isEncryptionEnabled()) return obj;
  const copy = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    if (typeof copy[field] === 'string') copy[field] = encryptValue(copy[field] as string);
  }
  return copy as T;
}

/** Cópia do objeto com os campos indicados legíveis. */
export function decryptFields<T extends object>(obj: T, fields: readonly string[]): T {
  if (fields.length === 0) return obj;
  const copy = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    if (isEncrypted(copy[field])) copy[field] = decryptValue(copy[field] as string);
  }
  return copy as T;
}
