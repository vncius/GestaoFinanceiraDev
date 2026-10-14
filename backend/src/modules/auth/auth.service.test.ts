import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

// O ID-token do Google é validado contra as chaves públicas do Google (rede);
// aqui só a verificação dele (a que passa `audience`) é simulada — a sessão
// própria continua usando o jose de verdade.
const googlePayload = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('jose', async (importOriginal) => {
  const original = await importOriginal<typeof import('jose')>();
  return {
    ...original,
    jwtVerify: vi.fn((token: string, key: unknown, options?: { audience?: string }) =>
      options?.audience
        ? Promise.resolve({ payload: googlePayload.current })
        : original.jwtVerify(token, key as Uint8Array, options),
    ),
  };
});
import { UsersMongoRepository } from './users.mongo-repository';
import { User } from './auth.types';
import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from './consent';

function makeRepo(initial: User[]) {
  const users = new Map(initial.map((u) => [u.id, { ...u }]));
  const repo = {
    findById: async (id: string) => (users.has(id) ? { ...users.get(id)! } : null),
    findByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    create: async (u: User) => {
      users.set(u.id, u);
      return u;
    },
    incrementSessionVersion: async (id: string) => {
      const u = users.get(id);
      if (u) u.sessionVersion = (u.sessionVersion ?? 0) + 1;
    },
    updateConsent: async (id: string, version: number, at: string) => {
      const u = users.get(id);
      if (u) Object.assign(u, { consentVersion: version, consentAcceptedAt: at });
    },
  };
  return { repo: repo as unknown as UsersMongoRepository, users };
}

const baseUser: User = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'a@b.com',
  name: 'A',
  provider: 'google',
  providerId: 'g-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function issue(service: AuthService, user: User): Promise<string> {
  return (service as unknown as { issueSession(u: User): Promise<string> }).issueSession(user);
}

describe('AuthService — sessão', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-suficiente';
  });

  it('aceita token válido e devolve usuário/tenant', async () => {
    const { repo } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    await expect(service.verifySession(token)).resolves.toMatchObject({ sub: 'user-1', tenantId: 'tenant-1' });
  });

  it('expira em 24h', async () => {
    const { repo } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it('sair de todos os dispositivos invalida tokens já emitidos', async () => {
    const { repo } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    await service.verifySession(token); // popula o cache

    await service.revokeAllSessions('user-1');

    await expect(service.verifySession(token)).rejects.toMatchObject({ code: 'auth.invalidSession' });
  });

  it('nova sessão emitida depois da revogação volta a valer', async () => {
    const { repo, users } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    await service.revokeAllSessions('user-1');
    const token = await issue(service, users.get('user-1')!);
    await expect(service.verifySession(token)).resolves.toMatchObject({ sub: 'user-1' });
  });

  it('recusa token de usuário que não existe mais', async () => {
    const { repo, users } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    users.delete('user-1');
    service.forgetUser('user-1');
    await expect(service.verifySession(token)).rejects.toMatchObject({ code: 'auth.invalidSession' });
  });

  it('recusa token assinado com outro segredo', async () => {
    const { repo } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    process.env.JWT_SECRET = 'outro-segredo-qualquer-bem-comprido';
    await expect(service.verifySession(token)).rejects.toMatchObject({ code: 'auth.invalidSession' });
  });
});

describe('AuthService — login com Google', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-suficiente';
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
  });

  it('recusa e-mail não verificado pelo Google', async () => {
    const { repo, users } = makeRepo([]);
    const service = new AuthService(repo);
    googlePayload.current = { sub: 'g-2', email: 'novo@x.com', email_verified: false };

    await expect(service.loginWithGoogle('token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'auth.googleEmailNotVerified',
    });
    expect(users.size).toBe(0);
  });

  it('recusa quando o Google não informa email_verified', async () => {
    const { repo } = makeRepo([]);
    const service = new AuthService(repo);
    googlePayload.current = { sub: 'g-2', email: 'novo@x.com' };
    await expect(service.loginWithGoogle('token')).rejects.toMatchObject({ code: 'auth.googleEmailNotVerified' });
  });

  it('cria o usuário e a sessão com e-mail verificado', async () => {
    const { repo, users } = makeRepo([]);
    const service = new AuthService(repo);
    googlePayload.current = { sub: 'g-2', email: 'novo@x.com', email_verified: true, name: 'Novo' };

    const { user, session } = await service.loginWithGoogle('token');

    expect(user).toMatchObject({ email: 'novo@x.com', name: 'Novo', sessionVersion: 0 });
    expect(users.size).toBe(1);
    await expect(service.verifySession(session)).resolves.toMatchObject({ sub: user.id });
  });
});

describe('AuthService — consentimento (LGPD)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-suficiente';
  });

  it('registra o aceite da versão vigente e a sessão já enxerga', async () => {
    const { repo } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    const token = await issue(service, baseUser);
    await service.sessionUser(token); // popula o cache sem consentimento

    await service.acceptConsent('user-1', CURRENT_CONSENT_VERSION);

    const { user } = await service.sessionUser(token);
    expect(hasCurrentConsent(user)).toBe(true);
    expect(user.consentAcceptedAt).toEqual(expect.any(String));
  });

  it('recusa aceite de versão diferente da vigente', async () => {
    const { repo, users } = makeRepo([baseUser]);
    const service = new AuthService(repo);
    await expect(service.acceptConsent('user-1', CURRENT_CONSENT_VERSION + 1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'auth.consentOutdated',
    });
    expect(users.get('user-1')!.consentVersion).toBeUndefined();
  });

  it('usuário antigo, sem aceite, precisa aceitar', () => {
    expect(hasCurrentConsent(baseUser)).toBe(false);
  });
});
