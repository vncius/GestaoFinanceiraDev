import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { createRateLimiter } from './rate-limit.middleware';
import { AppError } from '../errors/app-error';

function fakeReq(tenantId: string): Request {
  return { tenantId } as unknown as Request;
}

function fakeRes(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite até o limite e bloqueia a chamada seguinte com 429', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, code: 'onboarding.messages.rateLimited' });
    const req = fakeReq('tenant-a');
    const res = fakeRes();

    const next1 = vi.fn();
    limiter(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = vi.fn();
    limiter(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    const next3 = vi.fn();
    limiter(req, res, next3);
    expect(next3).toHaveBeenCalledTimes(1);
    const error = next3.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('onboarding.messages.rateLimited');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('isola a contagem por chave (tenant)', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, code: 'onboarding.messages.rateLimited' });
    const res = fakeRes();

    const nextA1 = vi.fn();
    limiter(fakeReq('tenant-a'), res, nextA1);
    expect(nextA1).toHaveBeenCalledWith();

    const nextB1 = vi.fn();
    limiter(fakeReq('tenant-b'), res, nextB1);
    expect(nextB1).toHaveBeenCalledWith();

    const nextA2 = vi.fn();
    limiter(fakeReq('tenant-a'), res, nextA2);
    expect(nextA2.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  it('reseta a contagem após a janela expirar', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, code: 'onboarding.messages.rateLimited' });
    const req = fakeReq('tenant-a');
    const res = fakeRes();

    limiter(req, res, vi.fn());
    const blocked = vi.fn();
    limiter(req, res, blocked);
    expect(blocked.mock.calls[0][0]).toBeInstanceOf(AppError);

    vi.advanceTimersByTime(60_001);

    const afterReset = vi.fn();
    limiter(req, res, afterReset);
    expect(afterReset).toHaveBeenCalledWith();
  });

  it('usa keyFn customizada quando fornecida', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      code: 'onboarding.messages.rateLimited',
      keyFn: () => 'chave-fixa',
    });
    const res = fakeRes();

    limiter(fakeReq('tenant-a'), res, vi.fn());
    const blocked = vi.fn();
    limiter(fakeReq('tenant-b'), res, blocked);
    expect(blocked.mock.calls[0][0]).toBeInstanceOf(AppError);
  });
});
