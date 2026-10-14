import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { requireCsrfHeader } from './csrf.middleware';
import { AppError } from '../errors/app-error';

function fakeReq(method: string, headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

const res = {} as Response;

describe('requireCsrfHeader', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('deixa %s passar sem cabeçalho', (method) => {
    const next = vi.fn();
    requireCsrfHeader(fakeReq(method), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('bloqueia %s sem X-Requested-With', (method) => {
    const next = vi.fn();
    requireCsrfHeader(fakeReq(method), res, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 403, code: 'auth.csrfHeaderMissing' });
  });

  it('bloqueia valor diferente do esperado', () => {
    const next = vi.fn();
    requireCsrfHeader(fakeReq('POST', { 'X-Requested-With': 'fetch' }), res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  it('aceita POST com X-Requested-With: XMLHttpRequest', () => {
    const next = vi.fn();
    requireCsrfHeader(fakeReq('POST', { 'X-Requested-With': 'XMLHttpRequest' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
