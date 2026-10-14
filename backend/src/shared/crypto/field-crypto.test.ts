import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEncryptionConfigured,
  blindIndex,
  decryptFields,
  decryptValue,
  encryptFields,
  encryptValue,
  isEncrypted,
} from './field-crypto';

const KEY = randomBytes(32).toString('base64');

describe('field-crypto', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('criptografa e descriptografa (ida e volta), com acento e emoji', () => {
    const text = 'Aluguel de março — apê 🏠';
    const enc = encryptValue(text);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain('Aluguel');
    expect(decryptValue(enc)).toBe(text);
  });

  it('mesmo texto gera cifras diferentes (IV aleatório)', () => {
    expect(encryptValue('igual')).not.toBe(encryptValue('igual'));
  });

  it('é idempotente: não criptografa duas vezes', () => {
    const enc = encryptValue('x');
    expect(encryptValue(enc)).toBe(enc);
  });

  it('lê texto puro antigo como está', () => {
    expect(decryptValue('texto antigo')).toBe('texto antigo');
  });

  it('detecta adulteração (GCM)', () => {
    const enc = encryptValue('valor');
    const raw = Buffer.from(enc.slice('enc:v1:'.length), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decryptValue('enc:v1:' + raw.toString('base64'))).toThrow();
  });

  it('chave errada não descriptografa', () => {
    const enc = encryptValue('valor');
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => decryptValue(enc)).toThrow();
  });

  it('encryptFields/decryptFields só mexem nos campos pedidos e em strings', () => {
    const obj = { id: 't1', description: 'Mercado', notes: null, amount: 1000 };
    const enc = encryptFields(obj, ['description', 'notes']);
    expect(isEncrypted(enc.description)).toBe(true);
    expect(enc.notes).toBeNull();
    expect(enc.amount).toBe(1000);
    expect(obj.description).toBe('Mercado'); // não altera o original
    expect(decryptFields(enc, ['description', 'notes'])).toEqual(obj);
  });

  it('índice cego é determinístico e ignora maiúsculas/espaços', () => {
    expect(blindIndex(' Fulano@Exemplo.com ')).toBe(blindIndex('fulano@exemplo.com'));
    expect(blindIndex('a@b.com')).not.toBe(blindIndex('c@d.com'));
  });

  it('sem chave: valores ficam legíveis (dev/testes)', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(encryptValue('x')).toBe('x');
    expect(encryptFields({ description: 'x' }, ['description'])).toEqual({ description: 'x' });
  });

  it('sem chave, mas com dado criptografado no banco: erro claro', () => {
    const enc = encryptValue('x');
    delete process.env.ENCRYPTION_KEY;
    expect(() => decryptValue(enc)).toThrow(/ENCRYPTION_KEY/);
  });

  it('produção sem chave não sobe; chave com tamanho errado também não', () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => assertEncryptionConfigured()).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = Buffer.from('curta').toString('base64');
    expect(() => assertEncryptionConfigured()).toThrow(/32 bytes/);
  });
});
