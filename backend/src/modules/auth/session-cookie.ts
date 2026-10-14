import { CookieOptions } from 'express';
import { SESSION_TTL_SECONDS } from './auth.service';

export const SESSION_COOKIE_NAME = 'session';

type SameSite = 'lax' | 'strict' | 'none';

// D2 do plano de segurança: em produção o frontend fala com a API pelo proxy
// same-origin do Cloudflare Pages (/api), então o cookie é first-party e pode
// ser Lax — o que já impede o envio em requisições disparadas por outros
// sites. COOKIE_SAME_SITE=none só para deploy cross-site sem proxy (e aí o
// Safari/iOS bloqueia o cookie de qualquer forma).
function sameSite(): SameSite {
  const value = process.env.COOKIE_SAME_SITE?.toLowerCase();
  return value === 'strict' || value === 'none' ? value : 'lax';
}

function baseOptions(): CookieOptions {
  const site = sameSite();
  return {
    httpOnly: true,
    // SameSite=None exige Secure em qualquer navegador moderno.
    secure: process.env.NODE_ENV === 'production' || site === 'none',
    sameSite: site,
    path: '/',
  };
}

export function sessionCookieOptions(): CookieOptions {
  return { ...baseOptions(), maxAge: SESSION_TTL_SECONDS * 1000 };
}

// clearCookie precisa dos mesmos atributos do cookie original para o
// navegador reconhecer e apagar.
export function clearSessionCookieOptions(): CookieOptions {
  return baseOptions();
}
