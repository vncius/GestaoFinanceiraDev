export enum AccountType {
  MAIN = 'MAIN',
  EMERGENCY_RESERVE = 'EMERGENCY_RESERVE',
  COMMON = 'COMMON',
}

export interface Account {
  id: string;
  tenantId: string;
  name: string;
  type: AccountType;
  initialBalance: number;      // centavos
  initialBalanceDate: string;  // ISO
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
