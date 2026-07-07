// ── Accounts ──────────────────────────────────────────────────────────────────
export type AccountType = 'MAIN' | 'EMERGENCY_RESERVE' | 'INVESTMENT' | 'OTHER';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Categories ────────────────────────────────────────────────────────────────
export type CategoryType = 'INCOME' | 'EXPENSE';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  active: boolean;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export interface FinancialSettings {
  id: string;
  defaultReservePercentage: number;
  applyReserveByDefault: boolean;
  allowDisableReserve: boolean;
  mainAccountId: string | null;
  emergencyReserveAccountId: string | null;
  minimumMainBalance: number;
  annualRevenueLimit: number;
  controlStartMonth: number;
  controlStartYear: number;
  pjLimitControlEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Receivables ───────────────────────────────────────────────────────────────
export type ReceivableStatus = 'EXPECTED' | 'RECEIVED' | 'CANCELED';
export type RecurrenceType = 'UNIQUE' | 'FIXED';

export interface Receivable {
  id: string;
  description: string;
  expectedPaymentDate: string;
  actualPaymentDate: string | null;
  grossAmount: number;
  separateReservePercentage: boolean;
  reservePercentageApplied: number;
  reserveAmount: number;
  netAmount: number;
  status: ReceivableStatus;
  incomeCategoryId: string;
  notes: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceCode: string | null;
  invoiceLink: string | null;
  invoiceIssueDate: string | null;
  competence: string | null;
  workedHours: number | null;
  hourlyRate: number | null;
  targetAccountId: string | null;
  recurrence: RecurrenceType;
  recurringGroupId: string | null;
  recurringActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Financial Transactions ────────────────────────────────────────────────────
export type TransactionType =
  | 'INCOME'
  | 'PAYMENT'
  | 'EXTRA_EXPENSE'
  | 'CREDIT_CARD_PAYMENT'
  | 'RESERVE'
  | 'TRANSFER'
  | 'ADJUSTMENT';

export type TransactionStatus =
  | 'PENDING'
  | 'PAID'
  | 'RECEIVED'
  | 'CANCELED'
  | 'REVERSED';

export interface FinancialTransaction {
  id: string;
  type: TransactionType;
  description: string;
  categoryId: string | null;
  amount: number;
  expectedDate: string;
  actualDate: string | null;
  status: TransactionStatus;
  sourceAccountId: string | null;
  targetAccountId: string | null;
  originType: string | null;
  originId: string | null;
  notes: string | null;
  recurrence: RecurrenceType;
  recurringGroupId: string | null;
  recurringActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Credit Cards ──────────────────────────────────────────────────────────────
export type CardEntryType = 'CASH' | 'FIXED' | 'INSTALLMENT';
export type InstallmentStatus = 'OPEN' | 'PAID' | 'CANCELED';
export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  defaultPaymentAccountId: string | null;
  active: boolean;
  currentMonth: number;
  currentYear: number;
  currentInvoice: CreditCardInvoice | null;
  currentMonthAmount: number;
  totalOpenAmount: number;
  totalFutureAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardEntry {
  id: string;
  creditCardId: string;
  description: string;
  expenseCategoryId: string;
  totalAmount: number;
  purchaseDate: string;
  entryType: CardEntryType;
  installmentsCount: number;
  closingDayUsed: number;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardInstallment {
  id: string;
  creditCardEntryId: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  month: number;
  year: number;
  status: InstallmentStatus;
  creditCardInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardInvoice {
  id: string;
  creditCardId: string;
  month: number;
  year: number;
  dueDate: string;
  totalAmount: number;
  status: InvoiceStatus;
  paymentDate: string | null;
  paymentAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardFlowResponse {
  card: CreditCard;
  month: number;
  year: number;
  invoice: CreditCardInvoice | null;
  installments: CreditCardInstallment[];
  entries: CreditCardEntry[];
  summary: {
    invoiceTotal: number;
    paidAmount: number;
    openAmount: number;
  };
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export interface CashFlowSummary {
  initialBalance: number;
  projectedInitialBalance: number;
  expectedIncome: number;
  receivedIncome: number;
  expectedPayments: number;
  paidPayments: number;
  expectedExtraExpenses: number;
  paidExtraExpenses: number;
  creditCardInvoices: number;
  paidCreditCardInvoices: number;
  projectedBalance: number;
  realizedBalance: number;
  reserveProjectedInitialBalance: number;
  reserveInflow: number;
  reserveOutflow: number;
  reserveEndBalance: number;
}

export interface CashFlowResponse {
  month: number;
  year: number;
  entries: Receivable[];
  payments: FinancialTransaction[];
  extraExpenses: FinancialTransaction[];
  creditCards: CreditCardInvoice[];
  summary: CashFlowSummary;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export type AlertType =
  | 'LOW_BALANCE'
  | 'OVERDUE_PAYMENT'
  | 'OVERDUE_RECEIVABLE'
  | 'INVOICE_DUE_SOON'
  | 'ANNUAL_LIMIT_WARNING';

export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type DueType = 'PAYMENT' | 'EXTRA_EXPENSE' | 'CREDIT_CARD_INVOICE';

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

export interface AccountBalance {
  id: string;
  name: string;
  balance: number;
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
