import { afterEach, describe, expect, it } from 'vitest';
import { Request } from 'express';
import { resolveClientIp, trustProxyHops } from './client-ip.middleware';

function fakeReq(headers: Record<string, string>, ip = '10.0.0.1'): Request {
  return { ip, socket: {}, get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

describe('resolveClientIp', () => {
  afterEach(() => {
    delete process.env.PROXY_SHARED_SECRET;
    delete process.env.TRUST_PROXY_HOPS;
  });

  it('usa X-Client-IP quando o segredo do proxy confere', () => {
    process.env.PROXY_SHARED_SECRET = 'segredo-do-proxy';
    const req = fakeReq({ 'x-client-ip': '203.0.113.7', 'x-proxy-secret': 'segredo-do-proxy' });
    expect(resolveClientIp(req)).toBe('203.0.113.7');
  });

  it('ignora X-Client-IP com segredo errado (cliente tentando forjar o IP)', () => {
    process.env.PROXY_SHARED_SECRET = 'segredo-do-proxy';
    const req = fakeReq({ 'x-client-ip': '203.0.113.7', 'x-proxy-secret': 'chute' });
    expect(resolveClientIp(req)).toBe('10.0.0.1');
  });

  it('ignora X-Client-IP quando o backend não tem segredo configurado', () => {
    const req = fakeReq({ 'x-client-ip': '203.0.113.7', 'x-proxy-secret': '' });
    expect(resolveClientIp(req)).toBe('10.0.0.1');
  });

  it('ignora valor que não parece IP', () => {
    process.env.PROXY_SHARED_SECRET = 'segredo-do-proxy';
    const req = fakeReq({ 'x-client-ip': '<script>', 'x-proxy-secret': 'segredo-do-proxy' });
    expect(resolveClientIp(req)).toBe('10.0.0.1');
  });

  it('aceita IPv6', () => {
    process.env.PROXY_SHARED_SECRET = 'segredo-do-proxy';
    const req = fakeReq({ 'x-client-ip': '2001:db8::1', 'x-proxy-secret': 'segredo-do-proxy' });
    expect(resolveClientIp(req)).toBe('2001:db8::1');
  });

  it('trust proxy default 1 e configurável', () => {
    expect(trustProxyHops()).toBe(1);
    process.env.TRUST_PROXY_HOPS = '2';
    expect(trustProxyHops()).toBe(2);
    process.env.TRUST_PROXY_HOPS = 'abc';
    expect(trustProxyHops()).toBe(1);
  });
});
