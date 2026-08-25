export type DashboardScope = 'CONSOLIDATED' | 'ACCOUNT';

export interface FinancialSettings {
  id: string;
  tenantId: string;
  // Modo de exibição do Dashboard: soma de todas as contas, ou só a conta
  // ativa do seletor (E5/E6 — ver docs/refactor-contas-pf-pj.md).
  dashboardScope: DashboardScope;
  createdAt: string;
  updatedAt: string;
}
