import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { UsersMongoRepository } from './users.mongo-repository';
import { User } from './auth.types';

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
