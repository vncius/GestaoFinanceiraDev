import { NextFunction, Request, Response } from 'express';
import { authService } from '../../container';
import { SESSION_COOKIE_NAME as COOKIE_NAME } from '../../modules/auth/session-cookie';
import { hasCurrentConsent } from '../../modules/auth/consent';

// Resolve usuário/tenant da requisição a partir do cookie de sessão emitido
// no login (Google). Aplicado a todas as rotas montadas após ele em
// server.ts — as rotas de /auth ficam de fora por serem públicas ou por
// precisarem funcionar antes do aceite das políticas.
//
// Sem o aceite da versão vigente da Política de Privacidade/Termos (LGPD),
// nenhum dado é lido nem gravado: 403 auth.consentRequired, e o frontend
// mostra a tela de aceite.
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  let session: Awaited<ReturnType<typeof authService.sessionUser>>;
  try {
    session = await authService.sessionUser(token);
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
    return;
  }
  if (!hasCurrentConsent(session.user)) {
    res.status(403).json({ error: 'Aceite das políticas pendente', code: 'auth.consentRequired' });
    return;
  }
  req.userId = session.payload.sub;
  req.tenantId = session.payload.tenantId;
  next();
}
