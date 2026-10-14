import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

// IP real do cliente (D4 do plano de segurança). Cadeia em produção:
// navegador → Pages Function (proxy /api) → load balancer do Render → Express.
// - Via proxy: o Cloudflare manda X-Client-IP (de CF-Connecting-IP) junto com
//   X-Proxy-Secret; só confiamos no X-Client-IP quando o segredo confere.
// - Direto (dev, ou alguém chamando o Render sem o proxy): req.ip, que já
//   considera o `trust proxy` configurado em server.ts.

function secretMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Evita gravar lixo arbitrário em logs/chaves de rate limit.
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

export function resolveClientIp(req: Request): string {
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret && secretMatches(req.get('x-proxy-secret'), secret)) {
    const forwarded = req.get('x-client-ip')?.trim();
    if (forwarded && IP_PATTERN.test(forwarded)) return forwarded;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function clientIp(req: Request, _res: Response, next: NextFunction): void {
  req.clientIp = resolveClientIp(req);
  next();
}

// Quantos proxies à frente do Express são confiáveis para X-Forwarded-For.
// Render: 1 (o load balancer). Ajustável por env sem mexer em código.
export function trustProxyHops(): number {
  const parsed = Number(process.env.TRUST_PROXY_HOPS);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
}
