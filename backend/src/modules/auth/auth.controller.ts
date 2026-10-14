import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { acceptConsentSchema, googleLoginSchema } from './auth.schemas';
import { PublicUser, User } from './auth.types';
import { AuditLogService } from '../audit-log/audit-log.service';
import { clearSessionCookieOptions, SESSION_COOKIE_NAME as COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { hasCurrentConsent } from './consent';
import { AppError } from '../../shared/errors/app-error';

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    consentRequired: !hasCurrentConsent(user),
  };
}

function notAuthenticated(): AppError {
  return new AppError('Não autenticado', 401, 'auth.invalidSession');
}

// As rotas de /auth ficam antes do authMiddleware em server.ts — inclusive as
// que exigem sessão (me, consent, logout-all), porque precisam funcionar
// antes do aceite das políticas. Cada uma valida o cookie por conta própria.
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly auditLog: AuditLogService,
  ) {}

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, sessionCookieOptions());
  }

  private async requireSession(req: Request) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw notAuthenticated();
    return this.service.sessionUser(token);
  }

  async google(req: Request, res: Response): Promise<void> {
    const { idToken } = googleLoginSchema.parse(req.body);
    try {
      const { user, session } = await this.service.loginWithGoogle(idToken);
      this.setSessionCookie(res, session);
      await this.auditLog.record({
        action: 'login',
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        ip: req.clientIp,
        userAgent: req.get('user-agent'),
      });
      res.json({ user: toPublicUser(user) });
    } catch (err) {
      await this.auditLog.record({
        action: 'login_failed',
        ip: req.clientIp,
        userAgent: req.get('user-agent'),
      });
      throw err;
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    const { user } = await this.requireSession(req);
    res.json({ user: toPublicUser(user) });
  }

  async acceptConsent(req: Request, res: Response): Promise<void> {
    const { version } = acceptConsentSchema.parse(req.body);
    const { user } = await this.requireSession(req);
    await this.service.acceptConsent(user.id, version);
    await this.auditLog.record({
      action: 'consent_accepted',
      tenantId: user.tenantId,
      userId: user.id,
      ip: req.clientIp,
      userAgent: req.get('user-agent'),
      details: { version },
    });
    const updated = await this.service.me(user.id);
    res.json({ user: toPublicUser(updated) });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[COOKIE_NAME];
    // Sessão pode já estar inválida/expirada — segue o logout normalmente,
    // só não conseguimos identificar o autor no log de auditoria.
    const actor = token ? await this.service.verifySession(token).catch(() => null) : null;

    res.clearCookie(COOKIE_NAME, clearSessionCookieOptions());
    await this.auditLog.record({
      action: 'logout',
      tenantId: actor?.tenantId,
      userId: actor?.sub,
      ip: req.clientIp,
      userAgent: req.get('user-agent'),
    });
    res.status(204).send();
  }

  // Sair de todos os dispositivos: invalida todas as sessões do usuário
  // (inclusive esta) e limpa o cookie desta.
  async logoutAll(req: Request, res: Response): Promise<void> {
    const { payload: actor } = await this.requireSession(req);
    await this.service.revokeAllSessions(actor.sub);
    res.clearCookie(COOKIE_NAME, clearSessionCookieOptions());
    await this.auditLog.record({
      action: 'logout_all',
      tenantId: actor.tenantId,
      userId: actor.sub,
      ip: req.clientIp,
      userAgent: req.get('user-agent'),
    });
    res.status(204).send();
  }
}
