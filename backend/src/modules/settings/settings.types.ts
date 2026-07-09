export interface FinancialSettings {
  id: string;
  tenantId: string;
  defaultReservePercentage: number;      // ex: 30 (%)
  applyReserveByDefault: boolean;
  allowDisableReserve: boolean;
  mainAccountId: string | null;
  emergencyReserveAccountId: string | null;
  minimumMainBalance: number;            // centavos
  annualRevenueLimit: number;            // centavos (0 = sem limite)
  controlStartMonth: number;             // 1–12
  controlStartYear: number;
  pjLimitControlEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
