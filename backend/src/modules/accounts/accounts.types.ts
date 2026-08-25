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
  // Destino da reserva automática (E8) — a própria conta é a origem; ao
  // registrar/receber uma entrada nela, uma % vai automaticamente para esta
  // conta via transferência (originType AUTO_RESERVE). Null quando
  // autoReserveEnabled é false.
  autoReserveTargetAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}
