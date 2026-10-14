import { Request } from 'express';
import { createRateLimiter } from './rate-limit.middleware';

// Limites da aplicação (D5 do plano de segurança). Em memória — valem para o
// processo único atual. Os números miram abuso, não uso normal: uma tela do
// app dispara poucas requisições, e importações/restauração são raras.

const MINUTE = 60_000;
const byIp = (req: Request) => `ip:${req.clientIp}`;

/** Qualquer rota, por IP — teto contra varredura/inundação. */
export const globalIpLimiter = createRateLimiter({
  windowMs: MINUTE,
  max: 600,
  code: 'common.rateLimited',
  keyFn: byIp,
});

/** Login com Google, por IP — dificulta tentativa em massa com tokens. */
export const loginLimiter = createRateLimiter({
  windowMs: MINUTE,
  max: 20,
  code: 'common.rateLimited',
  keyFn: byIp,
});

/**
 * Restauração de backup e importação de extrato/fatura, por tenant (corpo
 * grande, processamento caro). Contador único: cada importação são duas
 * chamadas (pré-visualizar + confirmar).
 */
export const importLimiter = createRateLimiter({
  windowMs: 10 * MINUTE,
  max: 20,
  code: 'common.rateLimited',
});

/** Zerar todos os dados, por tenant. */
export const destructiveLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  max: 5,
  code: 'common.rateLimited',
});

/** Exclusão de conta, por IP (a rota fica antes do authMiddleware, sem tenant resolvido). */
export const accountDeletionLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  max: 5,
  code: 'common.rateLimited',
  keyFn: byIp,
});
