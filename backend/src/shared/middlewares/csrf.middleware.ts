import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

// Proteção contra CSRF por cabeçalho customizado (D2 do plano de segurança).
// Um formulário ou <img> de outro site não consegue enviar cabeçalhos; um
// fetch de outra origem com cabeçalho customizado dispara preflight CORS,
// que só é liberado para CORS_ORIGIN. Somado ao cookie SameSite=Lax, cobre
// o caso sem depender de cookie de terceiro (que o Safari/iOS bloqueia).
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    next(new AppError('Requisição bloqueada por segurança', 403, 'auth.csrfHeaderMissing'));
    return;
  }
  next();
}
