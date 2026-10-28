// Rótulos do XLSX (docs/plano-relatorio-extrato.md, 4.4): o backend não conhece
// o idioma do usuário, então o frontend manda `lang`. Nomes de categoria e de
// conta saem como cadastrados.

export type ReportLang = 'pt' | 'en' | 'es';

export const REPORT_LANGS: ReportLang[] = ['pt', 'en', 'es'];

export interface ReportLabels {
  sheets: { summary: string; incomes: string; expenses: string; cards: string; transfers: string; categories: string; evolution: string };
  title: string;
  period: string;
  scope: string;
  allAccounts: string;
  generatedAt: string;
  indicator: string;
  expected: string;
  realized: string;
  initialBalance: string;
  incomeTotal: string;
  expenseTotal: string;
  betweenAccounts: string;
  finalBalance: string;
  pendingIncome: string;
  pendingExpenses: string;
  balanceByAccount: string;
  account: string;
  initial: string;
  final: string;
  date: string;
  type: string;
  description: string;
  category: string;
  invoiceRate: string;
  amount: string;
  status: string;
  fixed: string;
  yes: string;
  no: string;
  received: string;
  toReceive: string;
  paid: string;
  toPay: string;
  total: string;
  uncategorized: string;
  kinds: { payment: string; extra: string; invoiceTax: string; invoice: string };
  card: string;
  dueDate: string;
  paymentAccount: string;
  invoiceStatus: Record<string, string>;
  purchaseDate: string;
  installment: string;
  refund: string;
  cardSubtotal: string;
  grandTotal: string;
  from: string;
  to: string;
  autoReserve: string;
  incomeByCategory: string;
  expenseByCategory: string;
  percentage: string;
  month: string;
  income: string;
  expenses: string;
  result: string;
  noData: string;
}

const pt: ReportLabels = {
  sheets: { summary: 'Resumo', incomes: 'Entradas', expenses: 'Saídas', cards: 'Cartões', transfers: 'Transferências', categories: 'Categorias', evolution: 'Evolução' },
  title: 'Relatório do extrato', period: 'Período', scope: 'Escopo', allAccounts: 'Todas as contas', generatedAt: 'Gerado em',
  indicator: 'Indicador', expected: 'Previsto', realized: 'Realizado', initialBalance: 'Saldo inicial', incomeTotal: 'Entradas',
  expenseTotal: 'Saídas', betweenAccounts: 'Entre contas', finalBalance: 'Saldo final', pendingIncome: 'Entradas a receber no mês',
  pendingExpenses: 'Saídas a pagar no mês', balanceByAccount: 'Saldo por conta', account: 'Conta', initial: 'Saldo inicial', final: 'Saldo final',
  date: 'Data', type: 'Tipo', description: 'Descrição', category: 'Categoria', invoiceRate: 'NF %', amount: 'Valor', status: 'Situação', fixed: 'Fixo',
  yes: 'Sim', no: 'Não', received: 'Recebido', toReceive: 'A receber', paid: 'Pago', toPay: 'A pagar', total: 'Total', uncategorized: 'Sem categoria',
  kinds: { payment: 'Pagamento', extra: 'Gasto extra', invoiceTax: 'Imposto a pagar', invoice: 'Fatura do cartão' },
  card: 'Cartão', dueDate: 'Vencimento', paymentAccount: 'Conta pagadora',
  invoiceStatus: { OPEN: 'Aberta', CLOSED: 'Fechada', PAID: 'Paga', OVERDUE: 'Vencida', CANCELED: 'Cancelada' },
  purchaseDate: 'Data da compra', installment: 'Parcela', refund: 'Estorno', cardSubtotal: 'Subtotal do cartão', grandTotal: 'Total geral',
  from: 'De', to: 'Para', autoReserve: 'Reserva automática', incomeByCategory: 'Entradas por categoria', expenseByCategory: 'Saídas por categoria',
  percentage: '%', month: 'Mês', income: 'Entradas', expenses: 'Saídas', result: 'Resultado', noData: 'Sem lançamentos no período',
};

const en: ReportLabels = {
  sheets: { summary: 'Summary', incomes: 'Income', expenses: 'Expenses', cards: 'Cards', transfers: 'Transfers', categories: 'Categories', evolution: 'Trend' },
  title: 'Statement report', period: 'Period', scope: 'Scope', allAccounts: 'All accounts', generatedAt: 'Generated on',
  indicator: 'Indicator', expected: 'Expected', realized: 'Actual', initialBalance: 'Opening balance', incomeTotal: 'Income',
  expenseTotal: 'Expenses', betweenAccounts: 'Between accounts', finalBalance: 'Closing balance', pendingIncome: 'Income to receive this month',
  pendingExpenses: 'Expenses to pay this month', balanceByAccount: 'Balance by account', account: 'Account', initial: 'Opening balance', final: 'Closing balance',
  date: 'Date', type: 'Type', description: 'Description', category: 'Category', invoiceRate: 'Invoice %', amount: 'Amount', status: 'Status', fixed: 'Fixed',
  yes: 'Yes', no: 'No', received: 'Received', toReceive: 'To receive', paid: 'Paid', toPay: 'To pay', total: 'Total', uncategorized: 'Uncategorized',
  kinds: { payment: 'Payment', extra: 'Extra expense', invoiceTax: 'Tax due', invoice: 'Card statement' },
  card: 'Card', dueDate: 'Due date', paymentAccount: 'Paying account',
  invoiceStatus: { OPEN: 'Open', CLOSED: 'Closed', PAID: 'Paid', OVERDUE: 'Overdue', CANCELED: 'Canceled' },
  purchaseDate: 'Purchase date', installment: 'Installment', refund: 'Refund', cardSubtotal: 'Card subtotal', grandTotal: 'Grand total',
  from: 'From', to: 'To', autoReserve: 'Auto reserve', incomeByCategory: 'Income by category', expenseByCategory: 'Expenses by category',
  percentage: '%', month: 'Month', income: 'Income', expenses: 'Expenses', result: 'Net', noData: 'No entries in the period',
};

const es: ReportLabels = {
  sheets: { summary: 'Resumen', incomes: 'Entradas', expenses: 'Salidas', cards: 'Tarjetas', transfers: 'Transferencias', categories: 'Categorías', evolution: 'Evolución' },
  title: 'Informe del extracto', period: 'Período', scope: 'Alcance', allAccounts: 'Todas las cuentas', generatedAt: 'Generado el',
  indicator: 'Indicador', expected: 'Previsto', realized: 'Realizado', initialBalance: 'Saldo inicial', incomeTotal: 'Entradas',
  expenseTotal: 'Salidas', betweenAccounts: 'Entre cuentas', finalBalance: 'Saldo final', pendingIncome: 'Entradas por cobrar en el mes',
  pendingExpenses: 'Salidas por pagar en el mes', balanceByAccount: 'Saldo por cuenta', account: 'Cuenta', initial: 'Saldo inicial', final: 'Saldo final',
  date: 'Fecha', type: 'Tipo', description: 'Descripción', category: 'Categoría', invoiceRate: 'Factura %', amount: 'Valor', status: 'Situación', fixed: 'Fijo',
  yes: 'Sí', no: 'No', received: 'Cobrado', toReceive: 'Por cobrar', paid: 'Pagado', toPay: 'Por pagar', total: 'Total', uncategorized: 'Sin categoría',
  kinds: { payment: 'Pago', extra: 'Gasto extra', invoiceTax: 'Impuesto por pagar', invoice: 'Resumen de tarjeta' },
  card: 'Tarjeta', dueDate: 'Vencimiento', paymentAccount: 'Cuenta pagadora',
  invoiceStatus: { OPEN: 'Abierta', CLOSED: 'Cerrada', PAID: 'Pagada', OVERDUE: 'Vencida', CANCELED: 'Cancelada' },
  purchaseDate: 'Fecha de compra', installment: 'Cuota', refund: 'Reembolso', cardSubtotal: 'Subtotal de la tarjeta', grandTotal: 'Total general',
  from: 'De', to: 'Para', autoReserve: 'Reserva automática', incomeByCategory: 'Entradas por categoría', expenseByCategory: 'Salidas por categoría',
  percentage: '%', month: 'Mes', income: 'Entradas', expenses: 'Salidas', result: 'Resultado', noData: 'Sin movimientos en el período',
};

const BY_LANG: Record<ReportLang, ReportLabels> = { pt, en, es };

export const getReportLabels = (lang: ReportLang): ReportLabels => BY_LANG[lang] ?? pt;
