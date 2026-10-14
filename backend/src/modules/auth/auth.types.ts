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
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
}
