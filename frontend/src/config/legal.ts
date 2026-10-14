// Dados das políticas (LGPD). Ao mudar o texto de
// locales/*/legal.json, incremente CONSENT_VERSION aqui E
// CURRENT_CONSENT_VERSION em backend/src/modules/auth/consent.ts — todo
// usuário precisa aceitar a nova versão.
export const CONSENT_VERSION = 1;
export const LEGAL_LAST_UPDATED = '2026-10-14';

// Quem responde pelos dados e como falar com essa pessoa: definidos no
// build (Cloudflare Pages). Sem eles, as políticas mostram um aviso de
// "não configurado" em vez de inventar um responsável.
export const LEGAL_CONTROLLER = import.meta.env.VITE_LEGAL_CONTROLLER_NAME || '[responsável não configurado]';
export const LEGAL_CONTACT_EMAIL = import.meta.env.VITE_LEGAL_CONTACT_EMAIL || '[e-mail de contato não configurado]';
