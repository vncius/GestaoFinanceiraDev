// Versão vigente da Política de Privacidade e dos Termos de Uso (D6 do plano
// de segurança). Ao mudar o texto das políticas no frontend
// (frontend/src/locales/*/legal.json), incremente aqui E em
// frontend/src/config/legal.ts: todo usuário passa a ver a tela de aceite de
// novo e o backend recusa as rotas de dados até o novo aceite.
export const CURRENT_CONSENT_VERSION = 1;

export function hasCurrentConsent(user: { consentVersion?: number }): boolean {
  return user.consentVersion === CURRENT_CONSENT_VERSION;
}
