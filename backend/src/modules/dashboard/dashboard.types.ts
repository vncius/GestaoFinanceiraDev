import { CashFlowSummary } from '../cash-flow/cash-flow.types';
export type { CashFlowSummary };

export enum AlertType {
  LOW_BALANCE = 'LOW_BALANCE',
  OVERDUE_PAYMENT = 'OVERDUE_PAYMENT',
  OVERDUE_RECEIVABLE = 'OVERDUE_RECEIVABLE',
  INVOICE_DUE_SOON = 'INVOICE_DUE_SOON',
  ANNUAL_LIMIT_WARNING = 'ANNUAL_LIMIT_WARNING',
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export enum DueType {
  PAYMENT = 'PAYMENT',
  EXTRA_EXPENSE = 'EXTRA_EXPENSE',
  CREDIT_CARD_INVOICE = 'CREDIT_CARD_INVOICE',
}

export interface AccountBalance {
  id: string;
  name: string;
  balance: number;
}

export interface DashboardAlert {
  type: AlertType;
  message: string;
  severity: AlertSeverity;
}

export interface UpcomingDue {
  type: DueType;
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  status: string;
}

export interface MonthlyEvolutionItem {
  month: number;
  year: number;
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
}

export interface DashboardResponse {
  month: number;
  year: number;
  accounts: {
    main: AccountBalance | null;
    emergencyReserve: AccountBalance | null;
    totalBalance: number;
  };
  monthSummary: CashFlowSummary;
  upcomingDues: UpcomingDue[];
  alerts: DashboardAlert[];
  annualSummary: {
    grossIncome: number;
    annualLimit: number;
    limitUsedPercentage: number;
    enabled: boolean;
  };
  monthlyEvolution: MonthlyEvolutionItem[];
  categoryBreakdown: {
    income: CategoryBreakdownItem[];
    expenses: CategoryBreakdownItem[];
  };
}
