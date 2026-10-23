import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, addMonths, monthKey, monthYearOf } from '../../shared/utils/date.utils';
import { calcAccountBalance } from '../../shared/utils/balance.utils';
import { runInTransaction } from '../../shared/persistence/mongo-transaction';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CreditCardsRepository, CreditCardInvoicesRepository } from '../credit-cards/credit-cards.repository';
import { CreditCardInvoice, InvoiceStatus } from '../credit-cards/credit-cards.types';
import { TransfersService } from '../transfers/transfers.service';
import { CashFlowDataset, CashFlowResponse, InvoiceTaxDetail, TransferFlowItem } from './cash-flow.types';
import { sumSummaries, ZERO_SUMMARY } from './cash-flow-summary.utils';
import {
  CashFlowQuery,
  CreateTransactionInput,
  UpdateTransactionInput,
  PayActionInput,
  CreateIncomeInput,
  UpdateIncomeInput,
  ReceiveActionInput,
} from './cash-flow.schemas';
import { DeleteScope } from '../../shared/types/recurrence.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';
import {
  calcInvoiceTax,
  competenceOf,
  DEFAULT_INVOICE_TAX_DUE_DAY,
  invoiceTaxDueDate,
  invoiceTaxOriginId,
  parseInvoiceTaxOriginId,
} from './invoice-tax.utils';

// Shape comum aceito pelas mutações internas (update/recorrência), coberto tanto
// por CreateTransactionInput (sourceAccountId) quanto por CreateIncomeInput (targetAccountId).
type TransactionMutationInput = {
  description?: string;
  categoryId?: string;
  amount?: number;
  expectedDate?: string;
  sourceAccountId?: string | null;
  targetAccountId?: string | null;
  notes?: string | null;
  recurrence?: RecurrenceType;
  taxRateBps?: number | null;
  issueDate?: string | null;
};

const INVOICE_TAX_DESCRIPTION = 'Imposto a pagar';
const INVOICE_TAX_CATEGORY = 'Impostos';
// Campos que continuam livres numa NF com o imposto do mês já pago (decisão 3/4).
const INVOICE_FREE_FIELDS = new Set(['description', 'categoryId', 'notes']);
// Únicos campos editáveis na despesa de imposto (decisão 5).
const INVOICE_TAX_EXPENSE_EDITABLE_FIELDS = new Set(['expectedDate', 'sourceAccountId', 'notes']);

// Campos do patch que mudariam o lançamento fora do conjunto permitido;
// comparar valores (e não só presença) aceita a tela que reenvia o formulário inteiro.
function changedFieldsOutside(t: FinancialTransaction, patch: object, allowed: Set<string>): string[] {
  const current = t as unknown as Record<string, unknown>;
  return Object.entries(patch)
    .filter(([k, v]) => v !== undefined && !allowed.has(k) && (current[k] ?? null) !== v)
    .map(([k]) => k);
}

// Chave do "Imposto a pagar" afetado por um lançamento: a da competência de
// uma entrada NF, ou a da própria despesa de imposto; null para o resto.
function invoiceTaxKeyOf(t: FinancialTransaction): string | null {
  if (t.originType === OriginType.INVOICE_TAX) return t.originId;
  if (t.type !== TransactionType.INCOME || t.taxRateBps == null || !t.issueDate || !t.targetAccountId) return null;
  return invoiceTaxOriginId(t.targetAccountId, competenceOf(t.issueDate));
}

// Data de emissão de outra ocorrência de uma NF fixa: mantém a distância em
// meses entre emissão e recebimento da ocorrência de origem e o dia da emissão
// (com clamp em meses curtos). Sem isso, todas cairiam no mesmo mês de imposto.
function shiftedIssueDate(source: FinancialTransaction, expectedDate: string, issueDay?: number): string | null {
  if (!source.issueDate) return null;
  const issue = monthYearOf(source.issueDate);
  const from = monthYearOf(source.expectedDate);
  const to = monthYearOf(expectedDate);
  const delta = monthKey(to.month, to.year) - monthKey(from.month, from.year);
  const next = addMonths(issue.month, issue.year, delta, issueDay ?? issue.day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.year}-${pad(next.month)}-${pad(next.day)}T00:00:00.000Z`;
}

export class CashFlowService {
  constructor(
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
    private readonly creditCardInvoicesRepo?: CreditCardInvoicesRepository,
    private readonly creditCardsRepo?: CreditCardsRepository,
    private readonly transfersService?: TransfersService,
    private readonly categoriesRepo?: CategoriesRepository,
  ) {}

  // ─── GET /cash-flow/invoice-tax/:id ──────────────────────────────────────────

  // Despesa "Imposto a pagar" + as NFs da competência, cada uma com o seu imposto
  // (a soma dos `tax` é o valor calculado da despesa).
  async getInvoiceTax(id: string, tenantId: string): Promise<InvoiceTaxDetail> {
    const expense = await this.transactionsRepo.findById(id, tenantId);
    if (!expense || expense.originType !== OriginType.INVOICE_TAX || !expense.originId) {
      throw new AppError('Imposto a pagar não encontrado.', 404, 'invoiceTax.notFound');
    }
    const all = await this.transactionsRepo.findAll(tenantId);
    const invoices = all
      .filter(
        (t) =>
          t.originType !== OriginType.INVOICE_TAX &&
          invoiceTaxKeyOf(t) === expense.originId &&
          (t.status === TransactionStatus.PENDING || t.status === TransactionStatus.RECEIVED),
      )
      .sort((a, b) => (a.issueDate as string).localeCompare(b.issueDate as string))
      .map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        taxRateBps: t.taxRateBps as number,
        issueDate: t.issueDate as string,
        expectedDate: t.expectedDate,
        status: t.status,
        tax: calcInvoiceTax(t.amount, t.taxRateBps as number),
      }));
    return { expense, invoices, calculatedTotal: invoices.reduce((s, i) => s + i.tax, 0) };
  }

  // ─── GET /cash-flow ──────────────────────────────────────────────────────────

  async getCashFlow(
    tenantId: string,
    query: CashFlowQuery,
    dataset?: CashFlowDataset,
  ): Promise<CashFlowResponse> {
    const data = dataset ?? (await this.loadDataset(tenantId, query.month, query.year));
    return this.buildCashFlow(data, query);
  }

  // Mesma referência em várias contas com uma leitura só de cada coleção. O
  // dashboard consolidado chamava getCashFlow por conta ativa, e cada chamada
  // relia tudo — o custo crescia linearmente com o número de contas.
  async getCashFlowMany(
    tenantId: string,
    month: number,
    year: number,
    accountIds: string[],
    dataset?: CashFlowDataset,
  ): Promise<CashFlowResponse[]> {
    const data = dataset ?? (await this.loadDataset(tenantId, month, year));
    return accountIds.map((accountId) => this.buildCashFlow(data, { month, year, accountId }));
  }

  // Movimentações em "Todas as contas" (U17 do plano de UX): une o fluxo de
  // cada conta ativa. Transferência entre duas contas ativas aparece nas duas
  // listas (uma perna em cada) e se anula no resumo — some da lista
  // consolidada; transferência com conta inativa/externa permanece.
  async getConsolidatedCashFlow(
    tenantId: string,
    month: number,
    year: number,
    dataset?: CashFlowDataset,
  ): Promise<CashFlowResponse> {
    const data = dataset ?? (await this.loadDataset(tenantId, month, year));
    const activeIds = data.accounts.filter((a) => a.active).map((a) => a.id);
    const active = new Set(activeIds);
    const flows = activeIds.map((accountId) => this.buildCashFlow(data, { month, year, accountId }));

    const transfers = flows
      .flatMap((f) => f.transfers)
      .filter((t) => !active.has(t.counterpartAccountId));

    return {
      month,
      year,
      entries: flows.flatMap((f) => f.entries),
      payments: flows.flatMap((f) => f.payments),
      extraExpenses: flows.flatMap((f) => f.extraExpenses),
      transfers,
      creditCards: flows.flatMap((f) => f.creditCards),
      summary: flows.reduce((acc, f) => sumSummaries(acc, f.summary), ZERO_SUMMARY),
    };
  }

  // Materializa a recorrência fixa da referência e devolve o retrato dos dados
  // já com ela aplicada. Público para o dashboard tirar um retrato único e
  // reaproveitá-lo tanto nos próprios cálculos quanto nos resumos por conta.
  async loadDataset(tenantId: string, month: number, year: number): Promise<CashFlowDataset> {
    await this.ensureFixedTransactions(tenantId, month, year);

    const [transactions, accounts, invoices, cards] = await Promise.all([
      this.transactionsRepo.findAll(tenantId),
      this.accountsRepo.findAll(tenantId),
      this.creditCardInvoicesRepo?.findAll(tenantId) ?? Promise.resolve([]),
      this.creditCardsRepo?.findAll(tenantId) ?? Promise.resolve([]),
    ]);

    return { transactions, accounts, invoices, cards };
  }

  // Puramente em memória sobre o retrato recebido: os filtros por mês e por
  // intervalo (usados pelas previsões) são feitos sobre esses arrays, em vez
  // de buscar novamente no repositório por período.
  private buildCashFlow(data: CashFlowDataset, query: CashFlowQuery): CashFlowResponse {
    const { month, year, accountId } = query;
    const {
      transactions: allTransactions,
      accounts: allAccounts,
      invoices: allInvoices,
      cards: allCards,
    } = data;

    const account = allAccounts.find((a) => a.id === accountId);
    if (!account) {
      throw new AppError('Conta não encontrada.', 404, 'account.notFound');
    }

    // "Previsto" acumula do mês atual (real) até o mês de referência quando
    // este está no futuro — ex.: hoje é 07 e a referência é 12, soma 07..12.
    // Para mês de referência igual/anterior ao atual, o intervalo colapsa
    // para o próprio mês, preservando o comportamento anterior.
    const selectedKey = monthKey(month, year);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const isFutureSelection = selectedKey > monthKey(currentMonth, currentYear);
    const rangeStartMonth = isFutureSelection ? currentMonth : month;
    const rangeStartYear = isFutureSelection ? currentYear : year;
    const rangeStartKey = monthKey(rangeStartMonth, rangeStartYear);

    const dateKey = (iso: string) => {
      const { month: m, year: y } = monthYearOf(iso);
      return monthKey(m, y);
    };
    const inSelectedMonth = (key: number) => key === selectedKey;
    const inProjectionRange = (key: number) => key >= rangeStartKey && key <= selectedKey;

    // Cartões continuam globais ao tenant, mas a saída de uma fatura só entra
    // no fluxo da conta que efetivamente a paga (ou pagaria, se ainda aberta).
    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const invoicePayerAccountId = (inv: CreditCardInvoice): string | null =>
      inv.paymentAccountId ?? cardMap.get(inv.creditCardId)?.defaultPaymentAccountId ?? null;
    const invoicesForAccount = allInvoices.filter((inv) => invoicePayerAccountId(inv) === accountId);

    const monthInvoices = invoicesForAccount.filter(
      (inv) => inv.status !== InvoiceStatus.CANCELED && inSelectedMonth(monthKey(inv.month, inv.year)),
    );
    const rangeInvoices = invoicesForAccount.filter(
      (inv) =>
        inv.status !== InvoiceStatus.CANCELED &&
        inv.status !== InvoiceStatus.PAID &&
        inProjectionRange(monthKey(inv.month, inv.year)),
    );

    const entries = allTransactions.filter(
      (t) =>
        t.type === TransactionType.INCOME &&
        !this.isExcludedFromFlow(t) &&
        t.targetAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangeEntries = allTransactions.filter(
      (t) =>
        t.type === TransactionType.INCOME &&
        !this.isExcludedFromFlow(t) &&
        t.targetAccountId === accountId &&
        t.status !== TransactionStatus.RECEIVED &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    const payments = allTransactions.filter(
      (t) =>
        t.type === TransactionType.PAYMENT &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangePayments = allTransactions.filter(
      (t) =>
        t.type === TransactionType.PAYMENT &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        t.status !== TransactionStatus.PAID &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    const extraExpenses = allTransactions.filter(
      (t) =>
        t.type === TransactionType.EXTRA_EXPENSE &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const rangeExtraExpenses = allTransactions.filter(
      (t) =>
        t.type === TransactionType.EXTRA_EXPENSE &&
        !this.isExcludedFromFlow(t) &&
        t.sourceAccountId === accountId &&
        t.status !== TransactionStatus.PAID &&
        inProjectionRange(dateKey(t.expectedDate)),
    );

    // Transferências (D5): cada perna aparece só no fluxo da sua própria
    // conta; a contraparte (conta e nome) vem da perna irmã via
    // transferGroupId, já que ela pertence a outra conta e não está nas
    // demais listas desta resposta.
    const accountNameById = new Map(allAccounts.map((a) => [a.id, a.name]));
    const transferLegs = allTransactions.filter(
      (t) =>
        t.type === TransactionType.TRANSFER &&
        !this.isExcludedFromFlow(t) &&
        (t.sourceAccountId === accountId || t.targetAccountId === accountId) &&
        inSelectedMonth(dateKey(t.expectedDate)),
    );
    const transfers: TransferFlowItem[] = transferLegs.map((leg) => {
      // Sem o guarda de null uma perna legada sem transferGroupId casaria com
      // a primeira transação comum do tenant (todas têm transferGroupId null)
      // e exibiria um pagamento qualquer como contraparte.
      const sibling = leg.transferGroupId
        ? allTransactions.find((t) => t.transferGroupId === leg.transferGroupId && t.id !== leg.id)
        : undefined;
      const counterpartAccountId = sibling ? sibling.sourceAccountId ?? sibling.targetAccountId ?? '' : '';
      return {
        id: leg.id,
        transferGroupId: leg.transferGroupId as string,
        accountId: accountId,
        direction: leg.targetAccountId === accountId ? 'IN' : 'OUT',
        description: leg.description,
        amount: leg.amount,
        expectedDate: leg.expectedDate,
        actualDate: leg.actualDate,
        status: leg.status,
        notes: leg.notes,
        counterpartAccountId,
        counterpartAccountName: accountNameById.get(counterpartAccountId) ?? '—',
        isAutoReserve: leg.originType === OriginType.AUTO_RESERVE,
      };
    });

    // Somas de transferência para os totais do resumo (realizado/previsto) —
    // mantêm o invariante initialBalance_mêsSeguinte == realizedBalance_mêsAtual,
    // já que calcAccountBalance já soma transferências junto com os demais
    // tipos. Não viram campos novos em CashFlowSummary (D5 já não tem seção
    // de reserva paralela) — só entram nas somas de entrada/saída existentes.
    const transferInflowRealized = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.targetAccountId === accountId &&
          t.status === TransactionStatus.RECEIVED &&
          inSelectedMonth(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferOutflowRealized = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.sourceAccountId === accountId &&
          t.status === TransactionStatus.PAID &&
          inSelectedMonth(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferInflowExpected = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.targetAccountId === accountId &&
          t.status !== TransactionStatus.RECEIVED &&
          inProjectionRange(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);
    const transferOutflowExpected = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.TRANSFER &&
          !this.isExcludedFromFlow(t) &&
          t.sourceAccountId === accountId &&
          t.status !== TransactionStatus.PAID &&
          inProjectionRange(dateKey(t.expectedDate)),
      )
      .reduce((s, t) => s + t.amount, 0);

    const monthStart = new Date(year, month - 1, 1);
    const initialBalance = calcAccountBalance(account, allTransactions, monthStart);

    // realizado — sempre restrito ao mês selecionado
    const receivedIncome = entries
      .filter((t) => t.status === TransactionStatus.RECEIVED)
      .reduce((s, t) => s + t.amount, 0);

    const paidPayments = payments
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidExtraExpenses = extraExpenses
      .filter((t) => t.status === TransactionStatus.PAID)
      .reduce((s, t) => s + t.amount, 0);

    const paidCreditCards = monthInvoices
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .reduce((s, inv) => s + inv.totalAmount, 0);

    const realizedBalance =
      initialBalance +
      receivedIncome +
      transferInflowRealized -
      paidPayments -
      paidExtraExpenses -
      paidCreditCards -
      transferOutflowRealized;

    // pendente — só o mês selecionado, nunca acumulado: responde "quanto
    // ainda falta receber/pagar neste mês". Transferências ficam de fora
    // (não são ganho nem gasto); a projeção abaixo as considera à parte.
    const pendingEntries = entries.filter((t) => t.status !== TransactionStatus.RECEIVED);
    const pendingOutflows = [
      ...payments.filter((t) => t.status !== TransactionStatus.PAID),
      ...extraExpenses.filter((t) => t.status !== TransactionStatus.PAID),
    ];
    // Fatura sem nenhum lançamento (total 0) não é algo a pagar.
    const pendingInvoices = monthInvoices.filter((inv) => inv.status !== InvoiceStatus.PAID && inv.totalAmount > 0);
    const pendingIncome = pendingEntries.reduce((s, t) => s + t.amount, 0);
    const pendingExpenses =
      pendingOutflows.reduce((s, t) => s + t.amount, 0) +
      pendingInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

    // previsto — mês atual até o mês selecionado (colapsa para o próprio
    // mês quando a referência não é futura). Os filtros de intervalo só pegam
    // itens ainda pendentes, então a base da projeção é o saldo já realizado
    // até o fim do mês selecionado (= realizedBalance, pelo invariante
    // initialBalance_mêsSeguinte == realizedBalance_mêsAtual). Partir do saldo
    // do início do mês deixava de fora o que já foi recebido/pago no mês.
    const projectedInitialBalance = realizedBalance;
    const expectedIncome = rangeEntries.reduce((s, t) => s + t.amount, 0);
    const expectedPayments = rangePayments.reduce((s, t) => s + t.amount, 0);
    const expectedExtraExpenses = rangeExtraExpenses.reduce((s, t) => s + t.amount, 0);
    const creditCardInvoicesTotal = rangeInvoices.reduce((s, inv) => s + inv.totalAmount, 0);

    return {
      month,
      year,
      entries,
      payments,
      extraExpenses,
      transfers,
      creditCards: monthInvoices,
      summary: {
        initialBalance,
        projectedInitialBalance,
        expectedIncome,
        receivedIncome,
        expectedPayments,
        paidPayments,
        expectedExtraExpenses,
        paidExtraExpenses,
        creditCardInvoices: creditCardInvoicesTotal,
        paidCreditCardInvoices: paidCreditCards,
        pendingIncome,
        pendingIncomeCount: pendingEntries.length,
        pendingExpenses,
        pendingExpensesCount: pendingOutflows.length + pendingInvoices.length,
        transferInflow: transferInflowRealized,
        expectedTransferInflow: transferInflowExpected,
        transferOutflow: transferOutflowRealized,
        expectedTransferOutflow: transferOutflowExpected,
        projectedBalance:
          projectedInitialBalance +
          expectedIncome +
          transferInflowExpected -
          expectedPayments -
          expectedExtraExpenses -
          creditCardInvoicesTotal -
          transferOutflowExpected,
        realizedBalance,
      },
    };
  }

  // ─── Income ──────────────────────────────────────────────────────────────────

  async createIncome(tenantId: string, accountId: string, input: CreateIncomeInput): Promise<FinancialTransaction> {
    const targetAccountId = input.targetAccountId ?? accountId;
    const invoice = this.invoiceFields(input.taxRateBps ?? null, input.issueDate ?? null);
    if (invoice.taxRateBps != null && invoice.issueDate) {
      await this.assertInvoiceTaxNotPaid(tenantId, [
        invoiceTaxOriginId(targetAccountId, competenceOf(invoice.issueDate)),
      ]);
    }

    const now = nowISO();
    const id = generateId();
    const recurrence = input.recurrence ?? RecurrenceType.UNIQUE;
    return runInTransaction(async () => {
      const created = await this.transactionsRepo.create({
        id,
        tenantId,
        type: TransactionType.INCOME,
        description: input.description,
        categoryId: input.categoryId,
        amount: input.amount,
        expectedDate: input.expectedDate,
        actualDate: null,
        status: TransactionStatus.PENDING,
        sourceAccountId: null,
        targetAccountId,
        originType: null,
        originId: null,
        transferGroupId: null,
        ...invoice,
        notes: input.notes ?? null,
        recurrence,
        recurringGroupId: recurrence === RecurrenceType.FIXED ? id : null,
        recurringActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await this.syncInvoiceTaxFor(tenantId, [created]);
      return created;
    });
  }

  async updateIncome(
    id: string,
    input: UpdateIncomeInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.INCOME, input, tenantId, scope, referenceMonth, referenceYear);
  }

  async deleteIncome(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    await runInTransaction(async () => {
      await this.deleteTransactionChecked(id, TransactionType.INCOME, tenantId, scope, referenceMonth, referenceYear);
      // A reserva automática só existe enquanto existir a entrada que a gerou:
      // excluir a entrada cancela as duas pernas da transferência ligada a ela.
      await this.transfersService?.cascadeCancelForOrigin(tenantId, id);
    });
  }

  // A baixa da entrada e a reserva automática que ela dispara são uma coisa
  // só: sem a transação, uma falha ao gravar a transferência deixaria a
  // entrada recebida e a reserva por fazer.
  async receiveIncome(id: string, tenantId: string, input: ReceiveActionInput): Promise<FinancialTransaction> {
    return runInTransaction(async () => {
      const tx = await this.settleTransactionChecked(id, TransactionType.INCOME, tenantId, input?.actualDate, input?.amountReceived);
      await this.applyAutoReserve(tenantId, tx);
      return tx;
    });
  }

  async revertIncome(id: string, tenantId: string): Promise<FinancialTransaction> {
    return runInTransaction(async () => {
      const tx = await this.revertTransactionChecked(id, TransactionType.INCOME, tenantId);
      await this.transfersService?.cascadeRevertForOrigin(tenantId, id);
      return tx;
    });
  }

  // ─── Reserva automática (E8) ─────────────────────────────────────────────────

  // Ao receber uma entrada numa conta com regra de reserva ativa, gera (ou
  // reconfirma, se já existia — ver TransfersService.resettleByOrigin) uma
  // transferência automática de percentual x valor para a conta de destino
  // configurada. Silenciosamente ignorado se não houver transfersService
  // (não injetado em todo contexto de teste) ou se a conta não tiver uma
  // regra completa configurada (D4b: regra incompleta fica inerte).
  //
  // Limitação conhecida: editar o valor de uma entrada já RECEIVED (sem
  // passar por reverter/receber de novo) não recalcula a reserva vinculada.
  private async applyAutoReserve(tenantId: string, income: FinancialTransaction): Promise<void> {
    if (!this.transfersService || !income.targetAccountId) return;
    const account = await this.accountsRepo.findById(income.targetAccountId, tenantId);
    if (!account?.autoReserveEnabled || !account.autoReserveTargetAccountId || account.autoReservePercentage <= 0) {
      return;
    }
    // Conta de destino desativada depois de a regra ter sido criada: a perna
    // de entrada cairia numa conta que o dashboard não lista, fazendo o valor
    // sumir do consolidado. Melhor a regra ficar inerte até o usuário corrigi-la.
    const reserveTarget = await this.accountsRepo.findById(account.autoReserveTargetAccountId, tenantId);
    if (!reserveTarget?.active) return;
    const reserveAmount = Math.round((income.amount * account.autoReservePercentage) / 100);
    if (reserveAmount <= 0) return;

    await this.transfersService.resettleByOrigin(tenantId, income.id, {
      sourceAccountId: account.id,
      targetAccountId: account.autoReserveTargetAccountId,
      amount: reserveAmount,
      // Data do fato financeiro (a da entrada), não o timestamp da baixa:
      // actualDate guarda o instante do clique, e usá-lo jogaria a reserva de
      // uma entrada retroativa para o mês corrente.
      date: income.expectedDate,
      description: `Reserva automática — ${income.description}`,
    });
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  async createPayment(tenantId: string, accountId: string, input: CreateTransactionInput): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.PAYMENT, tenantId, accountId, input);
  }

  async updatePayment(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.PAYMENT, input, tenantId, scope, referenceMonth, referenceYear);
  }

  async deletePayment(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.PAYMENT, tenantId, scope, referenceMonth, referenceYear);
  }

  async payPayment(id: string, tenantId: string, input: PayActionInput): Promise<FinancialTransaction> {
    return this.settleTransactionChecked(id, TransactionType.PAYMENT, tenantId, input?.actualDate, input?.amountPaid);
  }

  async revertPayment(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.PAYMENT, tenantId);
  }

  // ─── Extra Expenses ───────────────────────────────────────────────────────────

  async createExtraExpense(
    tenantId: string,
    accountId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    return this.createTransaction(TransactionType.EXTRA_EXPENSE, tenantId, accountId, input);
  }

  async updateExtraExpense(
    id: string,
    input: UpdateTransactionInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    return this.updateTransactionChecked(id, TransactionType.EXTRA_EXPENSE, input, tenantId, scope, referenceMonth, referenceYear);
  }

  async deleteExtraExpense(
    id: string,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    return this.deleteTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId, scope, referenceMonth, referenceYear);
  }

  async payExtraExpense(
    id: string,
    tenantId: string,
    input: PayActionInput,
  ): Promise<FinancialTransaction> {
    return this.settleTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId, input?.actualDate, input?.amountPaid);
  }

  async revertExtraExpense(id: string, tenantId: string): Promise<FinancialTransaction> {
    return this.revertTransactionChecked(id, TransactionType.EXTRA_EXPENSE, tenantId);
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async createTransaction(
    type: TransactionType,
    tenantId: string,
    accountId: string,
    input: CreateTransactionInput,
  ): Promise<FinancialTransaction> {
    const sourceAccountId = input.sourceAccountId ?? accountId;

    const now = nowISO();
    const id = generateId();
    const recurrence = input.recurrence ?? RecurrenceType.UNIQUE;
    return this.transactionsRepo.create({
      id,
      tenantId,
      type,
      description: input.description,
      categoryId: input.categoryId,
      amount: input.amount,
      expectedDate: input.expectedDate,
      actualDate: null,
      status: TransactionStatus.PENDING,
      sourceAccountId,
      targetAccountId: null,
      originType: null,
      originId: null,
      transferGroupId: null,
      notes: input.notes ?? null,
      recurrence,
      recurringGroupId: recurrence === RecurrenceType.FIXED ? id : null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async updateTransactionChecked(
    id: string,
    type: TransactionType,
    input: TransactionMutationInput,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError('Lançamentos cancelados não podem ser editados.', 400, 'transaction.canceledCannotEdit');
    }
    if (tx.status === TransactionStatus.REVERSED) {
      throw new AppError('Lançamentos revertidos não podem ser editados.', 400, 'transaction.reversedCannotEdit');
    }
    if (tx.originType === OriginType.INVOICE_TAX) {
      const locked = changedFieldsOutside(tx, input, INVOICE_TAX_EXPENSE_EDITABLE_FIELDS);
      if (locked.length > 0) {
        throw new AppError(
          'No imposto a pagar só o vencimento, a conta e as observações podem ser alterados.',
          400,
          'invoiceTax.expenseLocked',
        );
      }
    }
    await this.assertInvoiceEditable(tenantId, tx, input);

    let recurrencePatch: Partial<FinancialTransaction> = {};
    if (input.recurrence !== undefined && input.recurrence !== tx.recurrence) {
      if (tx.recurrence === RecurrenceType.FIXED) {
        throw new AppError(
          'Não é possível reverter um lançamento fixo para único. Use a exclusão com escopo para encerrar a recorrência.',
          400,
          'transaction.fixedCannotRevertToUnique',
        );
      }
      recurrencePatch = { recurringGroupId: id, recurringActive: true };
    }

    if (tx.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja alterar apenas a referência atual ou também as futuras.',
          400,
          'transaction.updateScopeRequired',
        );
      }
      return this.updateFixedTransaction(tx, input, tenantId, scope, referenceMonth, referenceYear);
    }

    // Para transações já pagas, a própria transação é o impacto financeiro.
    // Atualizar seus campos (amount, sourceAccountId, etc.) recalcula saldos automaticamente.
    const invoicePatch = this.invoicePatch(tx, input);
    return runInTransaction(async () => {
      const updated = await this.transactionsRepo.update(
        id,
        { ...input, ...recurrencePatch, ...invoicePatch, updatedAt: nowISO() },
        tenantId,
      );
      // Chave antiga e nova: a NF pode ter mudado de mês ou de conta.
      await this.syncInvoiceTaxFor(tenantId, [tx, updated]);
      return updated;
    });
  }

  private async updateFixedTransaction(
    existing: FinancialTransaction,
    input: TransactionMutationInput,
    tenantId: string,
    scope: DeleteScope,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<FinancialTransaction> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;

    const invoicePatch = this.invoicePatch(existing, input);

    // As datas de cada ocorrência (recebimento e emissão) são individuais —
    // apenas os demais campos (valor, descrição, categoria, conta, notas,
    // alíquota) se propagam para as futuras.
    const { expectedDate: _expectedDate, issueDate: _issueDate, ...seriesPatch } = input;
    const source = { ...existing, ...input, ...invoicePatch } as FinancialTransaction;
    let futures: { tx: FinancialTransaction; patch: TransactionMutationInput }[] = [];
    if (scope === 'CURRENT_AND_FUTURE') {
      const all = await this.transactionsRepo.findAll(tenantId);
      futures = all
        .filter((t) => {
          if (t.id === existing.id || t.recurringGroupId !== groupId) return false;
          if (t.status !== TransactionStatus.PENDING) return false;
          const my = monthYearOf(t.expectedDate);
          return monthKey(my.month, my.year) > refKey;
        })
        .map((t) => ({ tx: t, patch: { ...seriesPatch, ...this.seriesInvoicePatch(t, seriesPatch.taxRateBps, source) } }));
      for (const { tx: t, patch } of futures) {
        await this.assertInvoiceEditable(tenantId, t, patch);
      }
    }

    return runInTransaction(async () => {
      const updated = await this.transactionsRepo.update(
        existing.id,
        { ...input, ...invoicePatch, updatedAt: now },
        tenantId,
      );
      const touched: FinancialTransaction[] = [existing, updated];

      for (const { tx: t, patch } of futures) {
        const future = await this.transactionsRepo.update(t.id, { ...patch, updatedAt: now }, tenantId);
        touched.push(t, future);
      }

      await this.syncInvoiceTaxFor(tenantId, touched);
      return updated;
    });
  }

  private async deleteTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
    scope?: DeleteScope,
    referenceMonth?: number,
    referenceYear?: number,
  ): Promise<void> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    // Some sozinha quando sai a última NF do mês (I3); excluir à mão nunca.
    if (tx.originType === OriginType.INVOICE_TAX) {
      throw new AppError(
        'O imposto a pagar não pode ser excluído: ele some sozinho quando não há mais notas fiscais no mês.',
        400,
        'invoiceTax.expenseCannotDelete',
      );
    }

    if (tx.status === this.settledStatus(type)) {
      throw new AppError(
        type === TransactionType.INCOME
          ? 'Lançamentos já recebidos não podem ser excluídos. Reverta primeiro.'
          : 'Lançamentos já pagos não podem ser excluídos. Reverta primeiro.',
        400,
        'transaction.settledCannotDelete',
      );
    }

    if (tx.recurrence === RecurrenceType.FIXED) {
      if (!scope || !referenceMonth || !referenceYear) {
        throw new AppError(
          'Informe se deseja excluir apenas a referência atual ou também as futuras.',
          400,
          'transaction.deleteScopeRequired',
        );
      }
      return this.deleteFixedTransaction(tx, tenantId, scope, referenceMonth, referenceYear);
    }

    await this.assertInvoiceTaxNotPaid(tenantId, [this.invoiceKeyOfNf(tx)]);

    await runInTransaction(async () => {
      await this.transactionsRepo.update(id, {
        status: TransactionStatus.CANCELED,
        updatedAt: nowISO(),
      }, tenantId);
      await this.syncInvoiceTaxFor(tenantId, [tx]);
    });
  }

  private async deleteFixedTransaction(
    existing: FinancialTransaction,
    tenantId: string,
    scope: DeleteScope,
    referenceMonth: number,
    referenceYear: number,
  ): Promise<void> {
    const now = nowISO();
    const refKey = monthKey(referenceMonth, referenceYear);
    const groupId = existing.recurringGroupId ?? existing.id;
    const all = await this.transactionsRepo.findAll(tenantId);
    const group = all.filter((t) => t.recurringGroupId === groupId);

    const toCancel = group.filter((t) => {
      if (t.status !== TransactionStatus.PENDING) return false;
      const my = monthYearOf(t.expectedDate);
      const key = monthKey(my.month, my.year);
      return scope === 'CURRENT' ? key === refKey : key >= refKey;
    });
    await this.assertInvoiceTaxNotPaid(tenantId, toCancel.map((t) => this.invoiceKeyOfNf(t)));

    await runInTransaction(async () => {
      for (const t of toCancel) {
        await this.transactionsRepo.update(t.id, { status: TransactionStatus.CANCELED, updatedAt: now }, tenantId);
      }

      if (scope === 'CURRENT_AND_FUTURE') {
        for (const t of group) {
          if (t.recurringActive) {
            await this.transactionsRepo.update(t.id, { recurringActive: false, updatedAt: now }, tenantId);
          }
        }
      }

      await this.syncInvoiceTaxFor(tenantId, toCancel);
    });
  }

  // ─── Recorrência (lançamentos fixos) ──────────────────────────────────────────

  // Agnóstico ao TransactionType — materializa recorrência fixa de PAYMENT,
  // EXTRA_EXPENSE e INCOME igualmente, já que todos compartilham recurringGroupId/recurringActive.
  private async ensureFixedTransactions(tenantId: string, targetMonth: number, targetYear: number): Promise<void> {
    const all = await this.transactionsRepo.findAll(tenantId);
    const fixed = all.filter((t) => t.recurrence === RecurrenceType.FIXED);
    if (fixed.length === 0) return;

    const groups = new Map<string, FinancialTransaction[]>();
    for (const t of fixed) {
      const gid = t.recurringGroupId ?? t.id;
      const arr = groups.get(gid) ?? [];
      arr.push(t);
      groups.set(gid, arr);
    }

    const targetKey = monthKey(targetMonth, targetYear);
    const now = nowISO();
    const created: FinancialTransaction[] = [];

    for (const group of groups.values()) {
      let latest = group[0];
      let anchor = group[0];
      for (const t of group) {
        if (t.expectedDate > latest.expectedDate) latest = t;
        if (t.expectedDate < anchor.expectedDate) anchor = t;
      }

      if (!latest.recurringActive) continue;

      const latestMY = monthYearOf(latest.expectedDate);
      if (monthKey(latestMY.month, latestMY.year) >= targetKey) continue;

      const anchorDay = monthYearOf(anchor.expectedDate).day;
      // Dia de emissão da âncora, pelo mesmo motivo do anchorDay: o clamp de
      // um mês curto não pode encurtar a emissão dos meses seguintes.
      const anchorIssueDay = anchor.issueDate ? monthYearOf(anchor.issueDate).day : undefined;
      let cursorMonth = latestMY.month;
      let cursorYear = latestMY.year;

      while (monthKey(cursorMonth, cursorYear) < targetKey) {
        const next = addMonths(cursorMonth, cursorYear, 1, anchorDay);
        cursorMonth = next.month;
        cursorYear = next.year;

        const newDate = new Date(next.year, next.month - 1, next.day).toISOString();
        const groupId = latest.recurringGroupId ?? latest.id;

        const occurrence = await this.transactionsRepo.create({
          ...latest,
          id: generateId(),
          expectedDate: newDate,
          actualDate: null,
          status: TransactionStatus.PENDING,
          recurringGroupId: groupId,
          recurringActive: true,
          ...(latest.issueDate ? { issueDate: shiftedIssueDate(latest, newDate, anchorIssueDay) } : {}),
          createdAt: now,
          updatedAt: now,
        });
        created.push(occurrence);
      }
    }

    await this.syncInvoiceTaxFor(tenantId, created);
  }

  // Status "concluído" varia por tipo: INCOME vira RECEIVED (espelha Receivable),
  // os demais tipos viram PAID.
  private settledStatus(type: TransactionType): TransactionStatus {
    return type === TransactionType.INCOME ? TransactionStatus.RECEIVED : TransactionStatus.PAID;
  }

  private async settleTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
    actualDate?: string,
    settledAmount?: number,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);
    const isIncome = type === TransactionType.INCOME;

    if (tx.status === this.settledStatus(type)) {
      throw new AppError(
        isIncome ? 'Lançamento já foi recebido.' : 'Lançamento já foi pago.',
        400,
        'transaction.alreadySettled',
      );
    }
    if (tx.status === TransactionStatus.CANCELED) {
      throw new AppError(
        isIncome ? 'Lançamentos cancelados não podem ser recebidos.' : 'Lançamentos cancelados não podem ser pagos.',
        400,
        'transaction.canceledCannotSettle',
      );
    }

    const now = nowISO();
    const effectiveDate = actualDate ?? tx.expectedDate;
    const amount = settledAmount ?? tx.amount;
    // Receber uma NF por outro valor muda o imposto; a data, não.
    if (amount !== tx.amount) await this.assertInvoiceTaxNotPaid(tenantId, [this.invoiceKeyOfNf(tx)]);

    // A baixa move expectedDate, nunca issueDate: o mês do imposto não muda.
    return runInTransaction(async () => {
      const updated = await this.transactionsRepo.update(id, {
        status: this.settledStatus(type),
        expectedDate: effectiveDate,
        actualDate: now,
        amount,
        updatedAt: now,
      }, tenantId);
      await this.syncInvoiceTaxFor(tenantId, [updated]);
      return updated;
    });
  }

  private async revertTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.getTransactionChecked(id, type, tenantId);

    if (tx.status !== this.settledStatus(type)) {
      throw new AppError(
        type === TransactionType.INCOME
          ? 'Apenas lançamentos com status RECEIVED podem ser revertidos.'
          : 'Apenas lançamentos com status PAID podem ser revertidos.',
        400,
        'transaction.notSettledCannotRevert',
      );
    }

    return runInTransaction(async () => {
      const updated = await this.transactionsRepo.update(id, {
        status: TransactionStatus.PENDING,
        actualDate: null,
        updatedAt: nowISO(),
      }, tenantId);
      // Desmarcar o pagamento do imposto volta o valor ao calculado.
      await this.syncInvoiceTaxFor(tenantId, [updated]);
      return updated;
    });
  }

  // ─── Imposto sobre NF (docs/plano-imposto-nf.md) ────────────────────────────

  // Alíquota e data de emissão andam juntas: sem alíquota a entrada não é NF
  // e a emissão é descartada; com alíquota, a emissão é obrigatória.
  private invoiceFields(
    taxRateBps: number | null,
    issueDate: string | null,
  ): { taxRateBps: number | null; issueDate: string | null } {
    if (taxRateBps == null) return { taxRateBps: null, issueDate: null };
    if (!issueDate) {
      throw new AppError('Informe a data de emissão da nota fiscal.', 400, 'invoiceTax.issueDateRequired');
    }
    return { taxRateBps, issueDate };
  }

  // Patch de NF de uma edição: só existe se a edição tocou em alíquota ou
  // emissão, e é validado contra o estado resultante, não só contra o input.
  private invoicePatch(
    tx: FinancialTransaction,
    input: TransactionMutationInput,
  ): Partial<FinancialTransaction> {
    if (input.taxRateBps === undefined && input.issueDate === undefined) return {};
    return this.invoiceFields(
      input.taxRateBps !== undefined ? input.taxRateBps : tx.taxRateBps ?? null,
      input.issueDate !== undefined ? input.issueDate : tx.issueDate ?? null,
    );
  }

  // Alíquota propagada para uma ocorrência futura ("esta e as futuras"): a
  // emissão não se propaga; a futura que vira NF ganha a sua, deslocada a
  // partir da ocorrência editada.
  private seriesInvoicePatch(
    future: FinancialTransaction,
    taxRateBps: number | null | undefined,
    source: FinancialTransaction,
  ): Pick<TransactionMutationInput, 'taxRateBps' | 'issueDate'> {
    if (taxRateBps === undefined) return {};
    if (taxRateBps === null) return { taxRateBps: null, issueDate: null };
    return { taxRateBps, issueDate: future.issueDate ?? shiftedIssueDate(source, future.expectedDate) };
  }

  // Chave do imposto quando o lançamento é uma NF (nunca a da própria despesa).
  private invoiceKeyOfNf(t: FinancialTransaction): string | null {
    return t.originType === OriginType.INVOICE_TAX ? null : invoiceTaxKeyOf(t);
  }

  // Com o imposto do mês pago, a NF fica travada (A4): só descrição, categoria
  // e observações mudam. Vale para o mês de antes e o de depois da edição —
  // mover uma NF para um mês já pago também falsificaria o valor pago.
  private async assertInvoiceEditable(
    tenantId: string,
    tx: FinancialTransaction,
    input: TransactionMutationInput,
  ): Promise<void> {
    if (tx.type !== TransactionType.INCOME) return;
    if (changedFieldsOutside(tx, input, INVOICE_FREE_FIELDS).length === 0) return;
    const after = { ...tx, ...input, ...this.invoicePatch(tx, input) } as FinancialTransaction;
    await this.assertInvoiceTaxNotPaid(tenantId, [this.invoiceKeyOfNf(tx), this.invoiceKeyOfNf(after)]);
  }

  private async assertInvoiceTaxNotPaid(tenantId: string, keys: (string | null)[]): Promise<void> {
    for (const key of new Set(keys)) {
      if (!key) continue;
      const expenses = await this.transactionsRepo.findByOrigin(tenantId, OriginType.INVOICE_TAX, key);
      if (!expenses.some((t) => t.status === TransactionStatus.PAID)) continue;
      const parsed = parseInvoiceTaxOriginId(key);
      throw new AppError(
        'O imposto deste mês já foi pago: a nota fiscal não pode ser alterada nem excluída. Desmarque o pagamento do imposto primeiro.',
        400,
        'invoiceTax.paidLocksInvoice',
        parsed
          ? { month: String(parsed.competence.month).padStart(2, '0'), year: parsed.competence.year }
          : undefined,
      );
    }
  }

  private async syncInvoiceTaxFor(tenantId: string, txs: FinancialTransaction[]): Promise<void> {
    const keys = new Set(txs.map(invoiceTaxKeyOf).filter((k): k is string => k !== null));
    for (const key of keys) {
      await this.syncInvoiceTax(tenantId, key);
    }
  }

  // Recalcula do zero a despesa "Imposto a pagar" de uma conta + competência,
  // como a fatura de cartão: soma o imposto de cada NF pendente ou recebida.
  // Sem NFs, cancela a despesa; uma NF nova reativa a mesma. Nunca mexe no
  // vencimento escolhido nem numa despesa já paga (que guarda o valor real do DAS).
  private async syncInvoiceTax(tenantId: string, originId: string): Promise<void> {
    try {
      await this.syncInvoiceTaxOnce(tenantId, originId);
    } catch (err) {
      // Duas requisições criaram a despesa ao mesmo tempo: o índice único
      // recusou a segunda. Na nova tentativa a despesa já existe e só é atualizada.
      if ((err as { code?: number } | null)?.code !== 11000) throw err;
      await this.syncInvoiceTaxOnce(tenantId, originId);
    }
  }

  private async syncInvoiceTaxOnce(tenantId: string, originId: string): Promise<void> {
    const parsed = parseInvoiceTaxOriginId(originId);
    if (!parsed) return;

    const all = await this.transactionsRepo.findAll(tenantId);
    const expense = all.find((t) => t.originType === OriginType.INVOICE_TAX && t.originId === originId);
    if (expense?.status === TransactionStatus.PAID) return;

    const total = all
      .filter(
        (t) =>
          t.originType !== OriginType.INVOICE_TAX &&
          invoiceTaxKeyOf(t) === originId &&
          (t.status === TransactionStatus.PENDING || t.status === TransactionStatus.RECEIVED),
      )
      .reduce((s, t) => s + calcInvoiceTax(t.amount, t.taxRateBps as number), 0);
    const now = nowISO();

    if (expense) {
      const status = total > 0 ? TransactionStatus.PENDING : TransactionStatus.CANCELED;
      const amount = total > 0 ? total : expense.amount;
      if (expense.status !== status || expense.amount !== amount) {
        await this.transactionsRepo.update(expense.id, { status, amount, updatedAt: now }, tenantId);
      }
      return;
    }
    if (total <= 0) return;

    const account = await this.accountsRepo.findById(parsed.accountId, tenantId);
    await this.transactionsRepo.create({
      id: generateId(),
      tenantId,
      type: TransactionType.PAYMENT,
      description: INVOICE_TAX_DESCRIPTION,
      categoryId: await this.invoiceTaxCategoryId(tenantId),
      amount: total,
      expectedDate: invoiceTaxDueDate(parsed.competence, account?.invoiceTaxDueDay ?? DEFAULT_INVOICE_TAX_DUE_DAY),
      actualDate: null,
      status: TransactionStatus.PENDING,
      // O imposto sai da própria conta da NF (padrão 8); o usuário pode trocar.
      sourceAccountId: parsed.accountId,
      targetAccountId: null,
      originType: OriginType.INVOICE_TAX,
      originId,
      transferGroupId: null,
      notes: null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Categoria "Impostos" de despesa (padrão 11), criada se o tenant não tiver.
  private async invoiceTaxCategoryId(tenantId: string): Promise<string | null> {
    if (!this.categoriesRepo) return null;
    const categories = await this.categoriesRepo.findByType(tenantId, CategoryType.EXPENSE);
    const found = categories.find((c) => c.name.trim().toLowerCase() === INVOICE_TAX_CATEGORY.toLowerCase());
    if (found) return found.id;
    const now = nowISO();
    const category = await this.categoriesRepo.create({
      id: generateId(),
      tenantId,
      name: INVOICE_TAX_CATEGORY,
      type: CategoryType.EXPENSE,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return category.id;
  }

  private async getTransactionChecked(
    id: string,
    type: TransactionType,
    tenantId: string,
  ): Promise<FinancialTransaction> {
    const tx = await this.transactionsRepo.findById(id, tenantId);
    if (!tx) throw new AppError('Lançamento não encontrado.', 404, 'transaction.notFound');
    if (tx.type !== type) {
      throw new AppError(
        `Lançamento não é do tipo ${type}.`,
        400,
        'transaction.wrongType',
        { type },
      );
    }
    return tx;
  }

  // ─── Balance calculation ──────────────────────────────────────────────────────

  private isExcludedFromFlow(t: FinancialTransaction): boolean {
    return (
      t.status === TransactionStatus.REVERSED ||
      t.status === TransactionStatus.CANCELED
    );
  }
}
