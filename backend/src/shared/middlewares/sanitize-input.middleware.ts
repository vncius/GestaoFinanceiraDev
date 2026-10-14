import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

// Defesa genérica contra injeção de operadores do MongoDB e poluição de
// protótipo (S7 do plano de segurança). Os schemas Zod de cada rota já
// rejeitam formatos inesperados; isto é a rede de proteção para qualquer
// caminho que repasse objetos do cliente adiante (ex.: um campo livre que
// chegasse a um filtro `{ campo: valor }` com valor `{ "$ne": null }`).

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 32;

function isUnsafeKey(key: string): boolean {
  return key.startsWith('$') || key.includes('\0') || FORBIDDEN_KEYS.has(key);
}

/** Devolve o caminho da primeira chave proibida encontrada, ou null. */
export function findUnsafeKey(value: unknown, path = '', depth = 0): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (depth > MAX_DEPTH) return path || '(raiz)';
  for (const key of Object.keys(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isUnsafeKey(key)) return childPath;
    const found = findUnsafeKey((value as Record<string, unknown>)[key], childPath, depth + 1);
    if (found) return found;
  }
  return null;
}

export function rejectUnsafeInput(req: Request, _res: Response, next: NextFunction): void {
  const unsafe = findUnsafeKey(req.body) ?? findUnsafeKey(req.query);
  if (unsafe) {
    next(new AppError('Entrada com chave não permitida', 400, 'validation.unsafeInput'));
    return;
  }
  next();
}
