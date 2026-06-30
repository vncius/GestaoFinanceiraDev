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

export interface DashboardResponse {
  month: number;
  year: number;
  accounts: {
    main: AccountBalance | null;
    emergencyReserve: AccountBalance | null;
    totalBalance: number;
  };
  monthSummary: {
    initialBalance: number;
    expectedIncome: number;
    receivedIncome: number;
    expectedPayments: number;
    paidPayments: number;
    expectedExtraExpenses: number;
    paidExtraExpenses: number;
    creditCardInvoices: number;
    paidCreditCards: number;
    projectedBalance: number;
    realizedBalance: number;
  };
  upcomingDues: UpcomingDue[];
  alerts: DashboardAlert[];
  annualSummary: {
    grossIncome: number;
    annualLimit: number;
    limitUsedPercentage: number;
  };
  monthlyEvolution: MonthlyEvolutionItem[];
}
