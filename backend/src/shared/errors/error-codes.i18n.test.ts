import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// O frontend traduz erros pelo `code` (frontend/src/services/api.ts); código
// sem chave em locales/*/errors.json vira "Ocorreu um erro inesperado".
const SRC = path.resolve(__dirname, '../..');
const LOCALES = path.resolve(SRC, '../../frontend/src/locales');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

function appErrorCodes(): string[] {
  const codes = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/new AppError\(\s*([`'"])[\s\S]*?\1\s*,\s*\d+\s*,\s*'([^']+)'/g)) codes.add(m[2]);
  }
  return [...codes].sort();
}

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatKeys(v as Record<string, unknown>, `${prefix}${k}.`),
  );
}

const readLocale = (lang: string, file: string) =>
  JSON.parse(readFileSync(path.join(LOCALES, lang, file), 'utf8')) as Record<string, unknown>;

describe('códigos de erro × traduções', () => {
  it('encontra os códigos do backend (sanidade do regex)', () => {
    expect(appErrorCodes().length).toBeGreaterThan(30);
  });

  it.each(['pt', 'en', 'es'])('todo AppError tem tradução em %s', (lang) => {
    const keys = new Set(flatKeys(readLocale(lang, 'errors.json')));
    expect(appErrorCodes().filter((c) => !keys.has(c))).toEqual([]);
  });

  it('en e es têm exatamente as mesmas chaves que pt, em todos os arquivos', () => {
    for (const file of readdirSync(path.join(LOCALES, 'pt'))) {
      const pt = flatKeys(readLocale('pt', file)).sort();
      for (const lang of ['en', 'es']) {
        expect({ file, lang, keys: flatKeys(readLocale(lang, file)).sort() }).toEqual({ file, lang, keys: pt });
      }
    }
  });
});
