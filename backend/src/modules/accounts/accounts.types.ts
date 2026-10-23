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
  // Imposto sobre NF (docs/plano-imposto-nf.md); ausentes em contas anteriores.
  invoiceTaxEnabled?: boolean;
  invoiceTaxDefaultRateBps?: number | null; // 600 = 6,00%
  invoiceTaxDueDay?: number;                // 1-28, padrão 20
  createdAt: string;
  updatedAt: string;
}
