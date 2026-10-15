// Testes de segurança de nível HTTP — as checagens que um pentest faria,
// escritas como regressão: dispara o "ataque" contra o app Express real e
// afirma que a defesa segura. Tudo resolvido na cadeia de middlewares, antes
// de qualquer acesso ao banco, então roda offline contra o app local.
//
// Cobre: cabeçalhos de segurança (helmet), exigência de autenticação,
// rejeição de token forjado, CSRF por cabeçalho, injeção de operador Mongo,
// poluição de protótipo, limite de corpo, JSON malformado e rate limit de
// login. Isolamento por tenant e ida/volta da cripto estão cobertos em
// mongo-store.test.ts e field-crypto.test.ts.

import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.JWT_SECRET = 'teste-forte-com-mais-de-32-bytes-aleatorios-xyz';
process.env.NODE_ENV = 'test';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = (await import('./app')).default;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

const xhr = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' };

describe('Cabeçalhos de segurança (helmet)', () => {
  it('/health traz CSP fechada, nosniff e frame deny, sem X-Powered-By', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('Autenticação exigida', () => {
  it('rota protegida sem cookie → 401', async () => {
    const res = await fetch(`${base}/accounts`);
    expect(res.status).toBe(401);
  });

  it('cookie de sessão forjado (assinado com outra chave) → 401', async () => {
    const forged = await new SignJWT({ sub: 'x', tenantId: 'y', sv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('chave-do-atacante-que-nao-e-a-do-servidor'));
    const res = await fetch(`${base}/accounts`, { headers: { Cookie: `session=${forged}` } });
    expect(res.status).toBe(401);
  });

  it('cookie de sessão com lixo (não-JWT) → 401', async () => {
    const res = await fetch(`${base}/accounts`, { headers: { Cookie: 'session=not-a-jwt' } });
    expect(res.status).toBe(401);
  });
});

describe('CSRF por cabeçalho (X-Requested-With)', () => {
  it('POST sem X-Requested-With → 403 (antes mesmo da autenticação)', async () => {
    const res = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'x' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('auth.csrfHeaderMissing');
  });

  it('DELETE sem o cabeçalho também é barrado → 403', async () => {
    const res = await fetch(`${base}/auth/account`, { method: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('GET (método seguro) não exige o cabeçalho', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
  });
});

describe('Injeção de operador do Mongo / poluição de protótipo', () => {
  it('operador $ no corpo → 400 validation.unsafeInput', async () => {
    const res = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: xhr,
      body: JSON.stringify({ idToken: { $ne: null } }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation.unsafeInput');
  });

  it('operador $ na query string → 400 validation.unsafeInput', async () => {
    const res = await fetch(`${base}/auth/google?$where=1`, { method: 'POST', headers: xhr, body: '{}' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation.unsafeInput');
  });

  it('chave __proto__ no corpo → 400 e Object.prototype intacto', async () => {
    const res = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: xhr,
      body: '{"__proto__":{"polluted":true}}',
    });
    expect(res.status).toBe(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('Limites de corpo e JSON', () => {
  it('corpo acima de 1 MB → 413 common.payloadTooLarge', async () => {
    const big = JSON.stringify({ idToken: 'a'.repeat(1_100_000) });
    const res = await fetch(`${base}/auth/google`, { method: 'POST', headers: xhr, body: big });
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('common.payloadTooLarge');
  });

  it('JSON malformado → 400 common.invalidJson', async () => {
    const res = await fetch(`${base}/auth/google`, { method: 'POST', headers: xhr, body: '{nao-e-json' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('common.invalidJson');
  });
});

describe('CORS', () => {
  it('não reflete uma origem arbitrária (sem ACAO: evil.com com credenciais)', async () => {
    const res = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });
});

describe('Rate limit de login por IP', () => {
  it('muitas tentativas no mesmo minuto → 429 com Retry-After', async () => {
    // Corpo {} passa CSRF/sanitize, incrementa o loginLimiter e para no 400 do
    // schema (sem bater na rede do Google). O 20º+ deve virar 429.
    let got429: Response | null = null;
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${base}/auth/google`, { method: 'POST', headers: xhr, body: '{}' });
      if (res.status === 429) {
        got429 = res;
        break;
      }
      await res.arrayBuffer();
    }
    expect(got429).not.toBeNull();
    expect((await got429!.json()).code).toBe('common.rateLimited');
    expect(Number(got429!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
