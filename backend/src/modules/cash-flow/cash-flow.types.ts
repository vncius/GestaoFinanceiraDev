import { FinancialTransaction, TransactionStatus } from '../financial-transactions/financial-transactions.types';
import { CreditCardInvoice } from '../credit-cards/credit-cards.types';

// Perna de transferência (D5) sob a ótica da conta selecionada — não é o
// FinancialTransaction cru porque o frontend precisa da contraparte (a outra
// perna pertence a outra conta, fora do escopo desta resposta) para exibir
// "de/para" sem uma chamada extra.
export interface TransferFlowItem {
  id: string;
  transferGroupId: string;
  direction: 'IN' | 'OUT';
  description: string;
  amount: number;
  expectedDate: string;
  actualDate: string | null;
  status: TransactionStatus;
  notes: string | null;
  counterpartAccountId: string;
  counterpartAccountName: string;
  // Perna gerada automaticamente por uma regra de reserva (E8), não por uma
  // transferência manual — badge própria no frontend.
  isAutoReserve: boolean;
}

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
  // Transferências sob a ótica da conta selecionada: a perna que entra é uma
  // entrada (prevista/efetiva) e a que sai é uma saída. Ficam em campos
  // próprios — e não somadas em expectedIncome/receivedIncome — para que o
  // resumo consiga exibi-las com a badge de transferência, mas entram nas
  // mesmas linhas de "Entradas"/"Saídas" da barra, sem as quais o saldo
  // final não fecharia com o que está listado na tela.
  transferInflow: number;
  expectedTransferInflow: number;
  transferOutflow: number;
  expectedTransferOutflow: number;
  projectedBalance: number;
  realizedBalance: number;
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
