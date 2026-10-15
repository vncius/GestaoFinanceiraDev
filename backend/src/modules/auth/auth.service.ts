import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { UsersMongoRepository } from './users.mongo-repository';
import { User } from './auth.types';
import { CURRENT_CONSENT_VERSION } from './consent';

const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Sessão curta (D1 do plano de segurança): um cookie roubado vale no máximo
// um dia, e "sair de todos os dispositivos" derruba as demais na hora.
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

// Cache do usuário usado na checagem de sessão, que roda a cada requisição.
// Processo único: revogações feitas aqui invalidam a entrada na hora; o TTL
// só limita quanto tempo uma mudança feita por fora (outro processo, script)
// demora a valer.
const USER_CACHE_TTL_MS = 60 * 1000;

export interface SessionPayload {
  sub: string;
  tenantId: string;
  /** Versão de sessão do usuário quando o token foi emitido (ausente em tokens antigos = 0). */
  sv?: number;
}

// Valor do backend/.env.example: público, então não pode assinar sessão de verdade.
const EXAMPLE_JWT_SECRET = 'troque-por-um-segredo-aleatorio-longo';
const MIN_JWT_SECRET_BYTES = 32;

/**
 * Falha cedo (no boot). Sem JWT_SECRET o servidor subia e só quebrava no
 * primeiro login; em produção, segredo curto ou o de exemplo deixaria
 * qualquer um assinar uma sessão válida (achado M1 do relatório de segurança).
 */
export function assertSessionSecretConfigured(): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurada. Defina-a no arquivo .env (openssl rand -base64 48).');
  if (Buffer.byteLength(secret, 'utf8') >= MIN_JWT_SECRET_BYTES && secret !== EXAMPLE_JWT_SECRET) return;
  const message = `JWT_SECRET fraca: use ao menos ${MIN_JWT_SECRET_BYTES} bytes aleatórios (openssl rand -base64 48), nunca o valor de exemplo.`;
  if (process.env.NODE_ENV === 'production') throw new Error(message);
  console.warn(`[auth] ${message}`);
}

function sessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurada. Defina-a no arquivo .env.');
  return new TextEncoder().encode(secret);
}

function invalidSession(): AppError {
  return new AppError('Sessão inválida ou expirada', 401, 'auth.invalidSession');
}

export class AuthService {
  private readonly userCache = new Map<string, { user: User; expiresAt: number }>();

  constructor(private readonly usersRepo: UsersMongoRepository) {}

  async loginWithGoogle(idToken: string): Promise<{ user: User; session: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID não configurado.');

    const payload = await jwtVerify(idToken, googleJWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    })
      .then((r) => r.payload)
      .catch(() => {
        throw new AppError('Token do Google inválido', 401, 'auth.invalidGoogleToken');
      });

    const email = payload.email as string | undefined;
    if (!email) throw new AppError('Token do Google sem e-mail', 401, 'auth.googleTokenMissingEmail');
    // A conta é identificada pelo e-mail: sem a confirmação do Google de que
    // a pessoa é dona dele, alguém poderia entrar na conta de outra pessoa
    // usando uma conta Google criada com aquele e-mail sem verificação.
    if (payload.email_verified !== true) {
      throw new AppError('E-mail do Google não verificado', 401, 'auth.googleEmailNotVerified');
    }
    const name = (payload.name as string | undefined) ?? email;

    const user = await this.findOrCreateUser('google', payload.sub as string, email, name);
    const session = await this.issueSession(user);
    return { user, session };
  }

  async me(userId: string): Promise<User> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new AppError('Usuário não encontrado', 404, 'auth.userNotFound');
    return user;
  }

  /**
   * Valida assinatura/expiração do token E que ele ainda pertence a um
   * usuário existente com a mesma versão de sessão — é isso que torna o
   * logout global e a exclusão de conta efetivos antes do token expirar.
   */
  async verifySession(token: string): Promise<SessionPayload> {
    return (await this.sessionUser(token)).payload;
  }

  /** Como verifySession, devolvendo também o usuário (consentimento, etc.). */
  async sessionUser(token: string): Promise<{ payload: SessionPayload; user: User }> {
    let payload: SessionPayload;
    try {
      ({ payload } = (await jwtVerify(token, sessionSecret())) as unknown as { payload: SessionPayload });
    } catch {
      throw invalidSession();
    }
    const user = await this.cachedUser(payload.sub);
    if (!user || (user.sessionVersion ?? 0) !== (payload.sv ?? 0)) throw invalidSession();
    return { payload, user };
  }

  /**
   * Registra o aceite da Política de Privacidade/Termos. A versão vem do
   * frontend para garantir que a pessoa aceitou o texto que estava vendo —
   * se as políticas mudaram nesse meio-tempo, ela precisa recarregar.
   */
  async acceptConsent(userId: string, version: number): Promise<void> {
    if (version !== CURRENT_CONSENT_VERSION) {
      throw new AppError('Versão das políticas desatualizada', 409, 'auth.consentOutdated');
    }
    await this.usersRepo.updateConsent(userId, version, nowISO());
    this.forgetUser(userId);
  }

  /** Invalida todas as sessões do usuário, inclusive a atual. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.usersRepo.incrementSessionVersion(userId, nowISO());
    this.forgetUser(userId);
  }

  forgetUser(userId: string): void {
    this.userCache.delete(userId);
  }

  private async cachedUser(userId: string): Promise<User | null> {
    const now = Date.now();
    const cached = this.userCache.get(userId);
    if (cached && cached.expiresAt > now) return cached.user;
    const user = await this.usersRepo.findById(userId);
    if (user) this.userCache.set(userId, { user, expiresAt: now + USER_CACHE_TTL_MS });
    else this.userCache.delete(userId);
    return user;
  }

  private async issueSession(user: User): Promise<string> {
    return new SignJWT({ sub: user.id, tenantId: user.tenantId, sv: user.sessionVersion ?? 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(sessionSecret());
  }

  private async findOrCreateUser(
    provider: 'google',
    providerId: string,
    email: string,
    name: string,
  ): Promise<User> {
    const existing = await this.usersRepo.findByEmail(email);
    if (existing) {
      if (existing.provider !== provider || existing.providerId !== providerId) {
        throw new AppError(
          `Este e-mail já está cadastrado via ${existing.provider}`,
          409,
          'auth.emailAlreadyRegistered',
          { provider: existing.provider },
        );
      }
      return existing;
    }

    const now = nowISO();
    const user: User = {
      id: generateId(),
      tenantId: generateId(),
      email,
      name,
      provider,
      providerId,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.usersRepo.create(user);
  }
}
