import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error';

// Rate limiter em memória (janela fixa por chave). Vale para o processo
// único atual; deploy multi-instância exigiria armazenamento compartilhado
// (risco documentado em docs/architecture/ai-security.md).

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Código i18n devolvido no AppError quando o limite é excedido. */
  code: string;
  /** Chave de contagem; default: tenant autenticado. */
  keyFn?: (req: Request) => string;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// Acima disso, uma varredura oportunista remove entradas expiradas para não
// crescer sem limite num processo de vida longa.
const CLEANUP_THRESHOLD = 5000;

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const store = new Map<string, WindowEntry>();
  const keyFn = options.keyFn ?? ((req: Request) => req.tenantId);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req);
    const now = Date.now();

    if (store.size > CLEANUP_THRESHOLD) {
      for (const [k, entry] of store) {
        if (now >= entry.resetAt) store.delete(k);
      }
    }

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + options.windowMs };
      store.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new AppError('Limite de requisições excedido', 429, options.code, {
          max: options.max,
          retryAfterSeconds,
        }),
      );
      return;
    }

    next();
  };
}
