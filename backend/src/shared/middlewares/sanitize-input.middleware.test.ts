import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { findUnsafeKey, rejectUnsafeInput } from './sanitize-input.middleware';
import { AppError } from '../errors/app-error';

describe('findUnsafeKey', () => {
  it('aceita objetos comuns', () => {
    expect(findUnsafeKey({ a: 1, b: { c: [1, { d: 'x' }] } })).toBeNull();
    expect(findUnsafeKey('texto')).toBeNull();
    expect(findUnsafeKey(null)).toBeNull();
  });

  it('acha operador do Mongo em qualquer nível', () => {
    expect(findUnsafeKey({ email: { $ne: null } })).toBe('email.$ne');
    expect(findUnsafeKey({ list: [{ ok: 1 }, { $where: 'x' }] })).toBe('list.1.$where');
  });

  it('acha poluição de protótipo', () => {
    expect(findUnsafeKey(JSON.parse('{"__proto__": {"admin": true}}'))).toBe('__proto__');
    expect(findUnsafeKey({ a: { constructor: { prototype: {} } } })).toBe('a.constructor');
  });

  it('não confunde cifrão no valor com chave', () => {
    expect(findUnsafeKey({ description: '$100 no mercado' })).toBeNull();
  });

  it('recusa aninhamento absurdo', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 40; i++) {
      deep.n = {};
      deep = deep.n as Record<string, unknown>;
    }
    expect(findUnsafeKey(root)).not.toBeNull();
  });
});

describe('rejectUnsafeInput', () => {
  it('bloqueia body ou query com chave proibida', () => {
    const next = vi.fn();
    rejectUnsafeInput({ body: {}, query: { month: { $gt: '' } } } as unknown as Request, {} as Response, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400, code: 'validation.unsafeInput' });
  });

  it('deixa passar entrada normal', () => {
    const next = vi.fn();
    rejectUnsafeInput({ body: { name: 'Conta' }, query: { month: '3' } } as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
