// ── Accounts ──────────────────────────────────────────────────────────────────
export interface AccountTypeItem {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  accountTypeId: string | null;
  initialBalance: number;
  active: boolean;
  autoReserveEnabled: boolean;
  autoReservePercentage: number;
  autoReserveTargetAccountId: string | null;
  invoiceTaxEnabled?: boolean;
  invoiceTaxDefaultRateBps?: number | null;
  invoiceTaxDueDay?: number;
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
  createdAt: string;
  updatedAt: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export type DashboardScope = 'CONSOLIDATED' | 'ACCOUNT';

export interface FinancialSettings {
  id: string;
  dashboardScope: DashboardScope;
  createdAt: string;
  updatedAt: string;
}

// ── Financial Transactions ────────────────────────────────────────────────────
export type RecurrenceType = 'UNIQUE' | 'FIXED';

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
  taxRateBps?: number | null;
  issueDate?: string | null;
  // Só no GET /cash-flow: na despesa de imposto, quantas NFs ela soma; na NF,
  // se o imposto da competência já foi pago (NF travada).
  invoiceTaxCount?: number;
  invoiceTaxPaid?: boolean;
  notes: string | null;
  recurrence: RecurrenceType;
  recurringGroupId: string | null;
  recurringActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Credit Cards ──────────────────────────────────────────────────────────────
export type CardEntryType = 'CASH' | 'FIXED' | 'INSTALLMENT' | 'REFUND' | 'PAYMENT';
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
  externalRef: string | null;
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

// ── Importação de fatura (OFX) ───────────────────────────────────────────────

export interface InvoiceImportInstallmentInfo {
  current: number;
  total: number;
}

export interface InvoiceImportPreviewEntry {
  key: string;
  date: string;
  description: string;
  amountCents: number;
  suggestedEntryType: 'CASH' | 'INSTALLMENT' | 'REFUND';
  installmentInfo: InvoiceImportInstallmentInfo | null;
  suggestedCategoryId: string | null;
  possibleDuplicate: boolean;
  existingEntryId: string | null;
  possiblePreviousInvoicePayment: boolean;
  externalRef: string | null;
  targetMonth: number;
  targetYear: number;
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
  // Ainda pendente só no mês selecionado (nunca acumulado): a receber e a
  // pagar (pagamentos + gastos extras + faturas). Sem transferências.
  pendingIncome: number;
  pendingIncomeCount: number;
  pendingExpenses: number;
  pendingExpensesCount: number;
  // Pernas de transferência da conta selecionada (entrada/saída, efetiva e
  // prevista). Não entram em Entradas/Saídas: utils/month-summary.ts as
  // exibe à parte, como saldo líquido "entre suas contas".
  transferInflow: number;
  expectedTransferInflow: number;
  transferOutflow: number;
  expectedTransferOutflow: number;
  projectedBalance: number;
  realizedBalance: number;
}

// Perna de transferência (E7) sob a ótica da conta selecionada — já traz a
// contraparte resolvida (a outra perna pertence a outra conta e não aparece
// em nenhuma outra lista desta resposta).
export interface TransferFlowItem {
  id: string;
  transferGroupId: string;
  // Conta desta perna — usada na visão "Todas as contas" (U17).
  accountId: string;
  direction: 'IN' | 'OUT';
  description: string;
  amount: number;
  expectedDate: string;
  actualDate: string | null;
  status: TransactionStatus;
  notes: string | null;
  counterpartAccountId: string;
  counterpartAccountName: string;
  isAutoReserve: boolean;
}

// Despesa "Imposto a pagar" (originType INVOICE_TAX), derivada das NFs.
export const INVOICE_TAX_ORIGIN = 'INVOICE_TAX';
export const isInvoiceTaxExpense = (t: Pick<FinancialTransaction, 'originType'>): boolean =>
  t.originType === INVOICE_TAX_ORIGIN;

// GET /cash-flow/invoice-tax/:id
export interface InvoiceTaxInvoice {
  id: string;
  description: string;
  amount: number;
  taxRateBps: number;
  issueDate: string;
  expectedDate: string;
  status: TransactionStatus;
  tax: number;
}

export interface InvoiceTaxDetail {
  expense: FinancialTransaction;
  invoices: InvoiceTaxInvoice[];
  calculatedTotal: number;
}

export interface CashFlowResponse {
  month: number;
  year: number;
  entries: FinancialTransaction[];
  payments: FinancialTransaction[];
  extraExpenses: FinancialTransaction[];
  transfers: TransferFlowItem[];
  creditCards: CreditCardInvoice[];
  summary: CashFlowSummary;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export type AlertType =
  | 'OVERDUE_PAYMENT'
  | 'OVERDUE_RECEIVABLE'
  | 'INVOICE_DUE_SOON';

export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type DueType = 'PAYMENT' | 'EXTRA_EXPENSE' | 'CREDIT_CARD_INVOICE' | 'INCOME';

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
  // Venceu e não foi pago/recebido (qualquer data antes de hoje).
  overdue: boolean;
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
  isReserve: boolean;
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
    list: AccountBalance[];
    totalBalance: number;
  };
  monthSummary: CashFlowSummary;
  upcomingDues: UpcomingDue[];
  alerts: DashboardAlert[];
  monthlyEvolution: MonthlyEvolutionItem[];
  categoryBreakdown: {
    income: CategoryBreakdownItem[];
    expenses: CategoryBreakdownItem[];
  };
}

// Relatório do extrato (GET /reports/statement) — espelha reports.types.ts do backend.
export type StatementLineKind = 'income' | 'payment' | 'extra' | 'invoiceTax';

export interface StatementLine {
  id: string;
  date: string;
  kind: StatementLineKind;
  description: string;
  categoryName: string | null;
  accountName: string;
  invoiceRatePct: number | null;
  amount: number;
  settled: boolean;
  fixed: boolean;
}

export interface StatementPurchase {
  purchaseDate: string;
  description: string;
  categoryName: string | null;
  installment: string | null;
  amount: number;
  refund: boolean;
}

export interface StatementInvoice {
  id: string;
  cardName: string;
  dueDate: string;
  status: InvoiceStatus;
  paymentAccountName: string | null;
  total: number;
  purchases: StatementPurchase[];
}

export interface StatementTransfer {
  id: string;
  date: string;
  description: string;
  direction: 'in' | 'out';
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  settled: boolean;
  autoReserve: boolean;
}

export interface StatementAccount {
  id: string;
  name: string;
  initialBalance: number;
  balance: number;
}

export interface StatementReport {
  month: number;
  year: number;
  scope: { accountId: string | null; accountName: string | null };
  generatedAt: string;
  summary: CashFlowSummary;
  accounts: StatementAccount[];
  categories: { income: CategoryBreakdownItem[]; expenses: CategoryBreakdownItem[] };
  evolution: MonthlyEvolutionItem[];
  incomes: StatementLine[];
  expenses: StatementLine[];
  invoices: StatementInvoice[];
  transfers: StatementTransfer[];
}
