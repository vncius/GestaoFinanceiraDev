import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { UsersMongoRepository } from './users.mongo-repository';
import { User } from './auth.types';

const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface SessionPayload {
  sub: string;
  tenantId: string;
}

function sessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurada. Defina-a no arquivo .env.');
  return new TextEncoder().encode(secret);
}

export class AuthService {
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

  async verifySession(token: string): Promise<SessionPayload> {
    try {
      const { payload } = await jwtVerify(token, sessionSecret());
      return payload as unknown as SessionPayload;
    } catch {
      throw new AppError('Sessão inválida ou expirada', 401, 'auth.invalidSession');
    }
  }

  private async issueSession(user: User): Promise<string> {
    return new SignJWT({ sub: user.id, tenantId: user.tenantId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
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
      createdAt: now,
      updatedAt: now,
    };
    return this.usersRepo.create(user);
  }
}
