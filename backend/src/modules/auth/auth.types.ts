export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  provider: 'google';
  providerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
}
