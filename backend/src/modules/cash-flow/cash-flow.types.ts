import { FinancialTransaction, TransactionStatus } from '../financial-transactions/financial-transactions.types';
import { CreditCard, CreditCardInvoice } from '../credit-cards/credit-cards.types';
import { Account } from '../accounts/accounts.types';

// Retrato dos dados que o fluxo de caixa consome. Existe para que um chamador
// que precise da mesma referência em várias contas (o dashboard consolidado)
// leia cada coleção uma vez só, em vez de uma varredura completa por conta.
export interface CashFlowDataset {
  transactions: FinancialTransaction[];
  accounts: Account[];
  invoices: CreditCardInvoice[];
  cards: CreditCard[];
}

// Resposta de GET /cash-flow/invoice-tax/:id.
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
  // Soma do imposto de cada NF; difere de expense.amount quando o valor real do DAS foi informado.
  calculatedTotal: number;
}

// Perna de transferência (D5) sob a ótica da conta selecionada — não é o
// FinancialTransaction cru porque o frontend precisa da contraparte (a outra
// perna pertence a outra conta, fora do escopo desta resposta) para exibir
// "de/para" sem uma chamada extra.
export interface TransferFlowItem {
  id: string;
  transferGroupId: string;
  // Conta desta perna (a "selecionada"); necessária na visão consolidada.
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
  // Perna gerada automaticamente por uma regra de reserva (E8), não por uma
  // transferência manual — badge própria no frontend.
  isAutoReserve: boolean;
}

export interface CashFlowSummary {
  initialBalance: number;
  // Base da projeção: saldo já realizado até o fim do mês selecionado (igual
  // a realizedBalance). projectedBalance = esta base + previstos pendentes.
  projectedInitialBalance: number;
  expectedIncome: number;
  receivedIncome: number;
  expectedPayments: number;
  paidPayments: number;
  expectedExtraExpenses: number;
  paidExtraExpenses: number;
  creditCardInvoices: number;
  paidCreditCardInvoices: number;
  // Ainda pendente só no mês selecionado (nunca acumulado, ao contrário dos
  // expected*): entradas a receber; pagamentos + gastos extras + faturas a
  // pagar. Transferências não entram — não são ganho nem gasto.
  pendingIncome: number;
  pendingIncomeCount: number;
  pendingExpenses: number;
  pendingExpensesCount: number;
  // Transferências sob a ótica da conta selecionada (perna que entra / que
  // sai, efetiva e prevista). Ficam em campos próprios, fora de
  // receivedIncome/paid*: transferência não é ganho nem gasto. O frontend as
  // exibe como saldo líquido "entre suas contas"; realizedBalance e
  // projectedBalance já as consideram.
  transferInflow: number;
  expectedTransferInflow: number;
  transferOutflow: number;
  expectedTransferOutflow: number;
  projectedBalance: number;
  realizedBalance: number;
}

// Lançamento do fluxo com as marcas do imposto sobre NF (I8): na despesa de
// imposto, quantas NFs ela soma; na NF, se o imposto da competência já foi pago.
export type CashFlowTransaction = FinancialTransaction & {
  invoiceTaxCount?: number;
  invoiceTaxPaid?: boolean;
};

export interface CashFlowResponse {
  month: number;
  year: number;
  entries: CashFlowTransaction[];
  payments: CashFlowTransaction[];
  extraExpenses: FinancialTransaction[];
  transfers: TransferFlowItem[];
  creditCards: CreditCardInvoice[];
  summary: CashFlowSummary;
}
