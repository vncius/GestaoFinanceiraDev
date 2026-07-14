import { NextFunction, Request, Response } from 'express';
import { authService } from '../../container';

const COOKIE_NAME = 'session';

// Resolve usuário/tenant da requisição a partir do cookie de sessão emitido
// no login (Google). Aplicado a todas as rotas montadas após ele em
// server.ts — as rotas de /auth ficam de fora por serem públicas.
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  try {
    const payload = await authService.verifySession(token);
    req.userId = payload.sub;
    req.tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}
