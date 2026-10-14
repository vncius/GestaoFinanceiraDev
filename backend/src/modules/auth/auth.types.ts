export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  provider: 'google';
  providerId: string;
  // Incrementado em "sair de todos os dispositivos": sessões emitidas com a
  // versão anterior deixam de valer. Ausente em usuários antigos (= 0).
  sessionVersion?: number;
  // Aceite da Política de Privacidade/Termos (LGPD): versão aceita e quando.
  consentVersion?: number;
  consentAcceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  /** true enquanto o usuário não aceitou a versão vigente das políticas (LGPD). */
  consentRequired: boolean;
}
