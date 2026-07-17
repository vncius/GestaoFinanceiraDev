import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { googleLoginSchema } from './auth.schemas';
import { PublicUser, User } from './auth.types';
import { AuditLogService } from '../audit-log/audit-log.service';

const COOKIE_NAME = 'session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
}

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly auditLog: AuditLogService,
  ) {}
  

  private setSessionCookie(res: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: THIRTY_DAYS_MS,
    });
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
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.json({ user: toPublicUser(user) });
    } catch (err) {
      await this.auditLog.record({
        action: 'login_failed',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw err;
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const payload = await this.service.verifySession(token);
    const user = await this.service.me(payload.sub);
    res.json({ user: toPublicUser(user) });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[COOKIE_NAME];
    // Sessão pode já estar inválida/expirada — segue o logout normalmente,
    // só não conseguimos identificar o autor no log de auditoria.
    const actor = token ? await this.service.verifySession(token).catch(() => null) : null;

    res.clearCookie(COOKIE_NAME);
    await this.auditLog.record({
      action: 'logout',
      tenantId: actor?.tenantId,
      userId: actor?.sub,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(204).send();
  }
}
