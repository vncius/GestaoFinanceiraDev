import { CashFlowSummary } from '../cash-flow/cash-flow.types';
import { CategoryBreakdownItem, MonthlyEvolutionItem } from '../dashboard/dashboard.types';
import { InvoiceStatus } from '../credit-cards/credit-cards.types';

// Relatório do extrato (docs/plano-relatorio-extrato.md, 4.1): uma só base para
// o XLSX (R2) e a página de impressão (R4). Valores em centavos.

export type StatementLineKind = 'income' | 'payment' | 'extra' | 'invoiceTax';

export interface StatementLine {
  id: string;
  // Data da baixa quando realizada; senão, a prevista.
  date: string;
  kind: StatementLineKind;
  description: string;
  categoryName: string | null;
  accountName: string;
  // Alíquota da NF em pontos percentuais (6 = 6%); null quando não é NF.
  invoiceRatePct: number | null;
  // Sempre positivo: o sinal vem da lista (entradas × saídas).
  amount: number;
  settled: boolean;
  fixed: boolean;
}

export interface StatementPurchase {
  purchaseDate: string;
  description: string;
  categoryName: string | null;
  // "3/10" nas compras parceladas; null nas à vista, fixas e estornos.
  installment: string | null;
  // Com sinal, como na fatura: estorno é negativo, então a soma bate com `total`.
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
  // Sob a ótica do escopo: com conta, 'in' entra nela; no consolidado, a perna
  // da conta ativa (a contraparte é inativa ou externa).
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
  // Saldo no início e no fim (realizado) do mês da referência.
  initialBalance: number;
  balance: number;
}

export interface StatementReport {
  month: number;
  year: number;
  // null = todas as contas.
  scope: { accountId: string | null; accountName: string | null };
  generatedAt: string;
  summary: CashFlowSummary;
  accounts: StatementAccount[];
  // Só o realizado, como no Dashboard (decisão 6).
  categories: { income: CategoryBreakdownItem[]; expenses: CategoryBreakdownItem[] };
  evolution: MonthlyEvolutionItem[];
  incomes: StatementLine[];
  expenses: StatementLine[];
  invoices: StatementInvoice[];
  transfers: StatementTransfer[];
}
