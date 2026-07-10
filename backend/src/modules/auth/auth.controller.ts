import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { googleLoginSchema, appleLoginSchema } from './auth.schemas';
import { PublicUser, User } from './auth.types';

const COOKIE_NAME = 'session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: THIRTY_DAYS_MS,
    });
  }

  async google(req: Request, res: Response): Promise<void> {
    const { idToken } = googleLoginSchema.parse(req.body);
    const { user, session } = await this.service.loginWithGoogle(idToken);
    this.setSessionCookie(res, session);
    res.json({ user: toPublicUser(user) });
  }

  async apple(req: Request, res: Response): Promise<void> {
    const { idToken, name } = appleLoginSchema.parse(req.body);
    const { user, session } = await this.service.loginWithApple(idToken, name);
    this.setSessionCookie(res, session);
    res.json({ user: toPublicUser(user) });
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

  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(COOKIE_NAME);
    res.status(204).send();
  }
}
