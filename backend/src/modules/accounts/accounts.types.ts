export interface Account {
  id: string;
  tenantId: string;
  name: string;
  accountTypeId: string | null;
  initialBalance: number;      // centavos
  initialBalanceDate: string;  // ISO
  active: boolean;
  autoReserveEnabled: boolean;
  autoReservePercentage: number; // 0-100, só relevante quando autoReserveEnabled
  createdAt: string;
  updatedAt: string;
}
