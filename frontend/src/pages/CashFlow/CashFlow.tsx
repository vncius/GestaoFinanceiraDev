import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMonth } from '../../contexts/MonthContext';
import { useAccount } from '../../contexts/AccountContext';
import { CashFlowService, CreateIncomePayload, CreateTransactionPayload } from '../../services/cash-flow.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { AccountsService } from '../../services/accounts.service';
import { CreateTransferPayload } from '../../services/transfers.service';
import { Account, CreditCardInvoice, FinancialTransaction, TransferFlowItem } from '../../types';
import { ScopedDeleteModal } from '../../components/ui/ScopedDeleteModal';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { PayInvoiceAccountModal } from '../../components/ui/PayInvoiceAccountModal';
import { monthYearFromDate } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { useToast } from '../../contexts/ToastContext';
import { PageFooter } from '../../contexts/PageFooterContext';
import { ModalKind, CashFlowTypeFilter } from './types';
import { useCashFlowMutations } from './useCashFlowMutations';
import { SummaryBar } from './components/SummaryBar';
import { EntriesGrid } from './components/EntriesGrid';
import { TransactionGrid } from './components/TransactionGrid';
import { TransferGrid } from './components/TransferGrid';
import { CreditCardsGrid } from './components/CreditCardsGrid';
import { IncomeModal } from './components/IncomeModal';
import { TransactionModal } from './components/TransactionModal';
import { TransferModal } from './components/TransferModal';
import { CashFlowFilterBar } from './components/CashFlowFilterBar';

export default function CashFlow() {
  const { t } = useTranslation('cashFlow');
  const { month, year } = useMonth();
  const { accountId } = useAccount();
  const navigate = useNavigate();

  const { confirm } = useDialog();
  const { showError } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['cashFlow', accountId, month, year],
    queryFn: () => CashFlowService.get(month, year, accountId as string),
    enabled: !!accountId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['creditCards'],
    queryFn: () => CreditCardsService.findAll(),
    staleTime: 60_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: Infinity,
  });

  const cardNames = useMemo(() => new Map(cards.map((c) => [c.id, c.name])), [cards]);

  // ── Summary bar state ────────────────────────────────────────────────────────
  // Vive no componente da página (que não desmonta ao trocar de mês) para que
  // o estado expandido/recolhido sobreviva à troca de referência.
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<CashFlowTypeFilter>('ALL');
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());
  const toggleCategoryFilter = (id: string) =>
    setExcludedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalKind | null>(null);
  const closeModal = () => setModal(null);
  const [invoicePayTarget, setInvoicePayTarget] = useState<CreditCardInvoice | null>(null);
  const [fixedDeleteTarget, setFixedDeleteTarget] = useState<
    | { kind: 'income' | 'payment' | 'extra-expense'; item: FinancialTransaction }
    | null
  >(null);
  const [fixedEditTarget, setFixedEditTarget] = useState<
    | { kind: 'income'; item: FinancialTransaction; payload: CreateIncomePayload }
    | { kind: 'payment' | 'extra-expense'; item: FinancialTransaction; payload: CreateTransactionPayload }
    | null
  >(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearAllScope, setShowClearAllScope] = useState(false);

  const {
    createIncome,
    updateIncome,
    receiveItem,
    revertIncome,
    deleteIncome,
    createPayment,
    updatePayment,
    payPayment,
    revertPayment,
    deletePayment,
    createExtra,
    updateExtra,
    payExtra,
    revertExtra,
    deleteExtra,
    payInvoice,
    revertInvoice,
    createTransfer,
    updateTransfer,
    revertTransfer,
    deleteTransfer,
  } = useCashFlowMutations({
    accountId: accountId as string,
    month,
    year,
    closeModal,
    clearFixedDeleteTarget: () => setFixedDeleteTarget(null),
    clearInvoicePayTarget: () => setInvoicePayTarget(null),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const EFFECTED_CONFIRM = t('page.confirmEdit');
  const EFFECTED_DELETE_CONFIRM = t('page.confirmDeleteEffected');

  async function saveIncome(payload: CreateIncomePayload) {
    if (modal?.type !== 'income') return;
    if (modal.item?.status === 'RECEIVED' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      if (modal.item.recurrence === 'FIXED') {
        closeModal();
        setFixedEditTarget({ kind: 'income', item: modal.item, payload });
        return;
      }
      updateIncome.mutate({ id: modal.item.id, data: payload });
    } else {
      createIncome.mutate(payload);
    }
  }

  async function saveTransaction(payload: CreateTransactionPayload) {
    if (modal?.type !== 'payment' && modal?.type !== 'extra-expense') return;
    const isPayment = modal.type === 'payment';
    if (modal.item?.status === 'PAID' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      if (modal.item.recurrence === 'FIXED') {
        closeModal();
        setFixedEditTarget({ kind: modal.type, item: modal.item, payload });
        return;
      }
      if (isPayment) updatePayment.mutate({ id: modal.item.id, data: payload });
      else updateExtra.mutate({ id: modal.item.id, data: payload });
    } else {
      if (isPayment) createPayment.mutate(payload);
      else createExtra.mutate(payload);
    }
  }

  function runScopedEdit(scope: 'CURRENT' | 'CURRENT_AND_FUTURE') {
    if (!fixedEditTarget) return;
    const { month: m, year: y } = monthYearFromDate(fixedEditTarget.item.expectedDate);
    if (fixedEditTarget.kind === 'income') {
      updateIncome.mutate({ id: fixedEditTarget.item.id, data: fixedEditTarget.payload, scope, month: m, year: y });
    } else if (fixedEditTarget.kind === 'payment') {
      updatePayment.mutate({ id: fixedEditTarget.item.id, data: fixedEditTarget.payload, scope, month: m, year: y });
    } else {
      updateExtra.mutate({ id: fixedEditTarget.item.id, data: fixedEditTarget.payload, scope, month: m, year: y });
    }
    setFixedEditTarget(null);
  }

  function handleTxPay(id: string) {
    if (modal?.type === 'payment') payPayment.mutate(id);
    else if (modal?.type === 'extra-expense') payExtra.mutate(id);
  }

  function handleOpenInvoice(inv: CreditCardInvoice) {
    navigate('/credit-cards', { state: { cardId: inv.creditCardId } });
  }

  async function saveTransfer(payload: CreateTransferPayload) {
    if (modal?.type !== 'transfer') return;
    const isSettled = modal.item?.status === 'PAID' || modal.item?.status === 'RECEIVED';
    if (isSettled && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      updateTransfer.mutate({ transferGroupId: modal.item.transferGroupId, data: payload });
    } else {
      createTransfer.mutate(payload);
    }
  }

  async function handleDeleteTransfer(item: TransferFlowItem) {
    if (!(await confirm(t('page.confirmDelete')))) return;
    deleteTransfer.mutate(item.transferGroupId);
  }

  async function handleDeleteIncome(item: FinancialTransaction) {
    if (item.recurrence === 'FIXED') { setFixedDeleteTarget({ kind: 'income', item }); return; }
    const isReceived = item.status === 'RECEIVED';
    if (!(await confirm(isReceived ? EFFECTED_DELETE_CONFIRM : t('page.confirmDelete')))) return;
    if (isReceived) await revertIncome.mutateAsync(item.id);
    deleteIncome.mutate({ id: item.id });
  }

  async function handleDeleteTransaction(kind: 'payment' | 'extra-expense', item: FinancialTransaction) {
    if (item.recurrence === 'FIXED') { setFixedDeleteTarget({ kind, item }); return; }
    const isPaid = item.status === 'PAID';
    if (!(await confirm(isPaid ? EFFECTED_DELETE_CONFIRM : t('page.confirmDelete')))) return;
    if (isPaid) await (kind === 'payment' ? revertPayment : revertExtra).mutateAsync(item.id);
    (kind === 'payment' ? deletePayment : deleteExtra).mutate({ id: item.id });
  }

  async function runScopedDelete(scope: 'CURRENT' | 'CURRENT_AND_FUTURE') {
    if (!fixedDeleteTarget) return;
    const { month: m, year: y } = monthYearFromDate(fixedDeleteTarget.item.expectedDate);
    if (fixedDeleteTarget.kind === 'income') {
      if (fixedDeleteTarget.item.status === 'RECEIVED') await revertIncome.mutateAsync(fixedDeleteTarget.item.id);
      deleteIncome.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    } else if (fixedDeleteTarget.kind === 'payment') {
      if (fixedDeleteTarget.item.status === 'PAID') await revertPayment.mutateAsync(fixedDeleteTarget.item.id);
      deletePayment.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    } else {
      if (fixedDeleteTarget.item.status === 'PAID') await revertExtra.mutateAsync(fixedDeleteTarget.item.id);
      deleteExtra.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    }
  }

  const showIncome = typeFilter === 'ALL' || typeFilter === 'INCOME';
  const showExpense = typeFilter === 'ALL' || typeFilter === 'EXPENSE';

  const filteredEntries = useMemo(
    () => (showIncome && data ? data.entries.filter((item) => !item.categoryId || !excludedCategoryIds.has(item.categoryId)) : []),
    [showIncome, data, excludedCategoryIds],
  );
  const filteredPayments = useMemo(
    () => (showExpense && data ? data.payments.filter((item) => !item.categoryId || !excludedCategoryIds.has(item.categoryId)) : []),
    [showExpense, data, excludedCategoryIds],
  );
  const filteredExtraExpenses = useMemo(
    () => (showExpense && data ? data.extraExpenses.filter((item) => !item.categoryId || !excludedCategoryIds.has(item.categoryId)) : []),
    [showExpense, data, excludedCategoryIds],
  );
  const filteredCreditCards = useMemo(
    () => (showExpense && data ? data.creditCards : []),
    [showExpense, data],
  );

  if (!accountId || isLoading || !data) return <PageLoading />;

  const { summary } = data;

  // ── Limpar referência (entradas, pagamentos e gastos extraordinários) ───────
  // Cartões de crédito têm seu próprio botão de limpeza (fatura), por isso
  // ficam de fora aqui.
  const allEntries = data.entries;
  const allPayments = data.payments;
  const allExtraExpenses = data.extraExpenses;
  const clearAllCount = allEntries.length + allPayments.length + allExtraExpenses.length;
  const hasFixedToClear =
    allEntries.some((i) => i.recurrence === 'FIXED') ||
    allPayments.some((i) => i.recurrence === 'FIXED') ||
    allExtraExpenses.some((i) => i.recurrence === 'FIXED');

  async function runClearAll(scope?: 'CURRENT' | 'CURRENT_AND_FUTURE') {
    setClearingAll(true);
    try {
      for (const item of allEntries) {
        if (item.status === 'RECEIVED') await revertIncome.mutateAsync(item.id);
        await deleteIncome.mutateAsync(
          item.recurrence === 'FIXED' ? { id: item.id, scope, month, year } : { id: item.id },
        );
      }
      for (const item of allPayments) {
        if (item.status === 'PAID') await revertPayment.mutateAsync(item.id);
        await deletePayment.mutateAsync(
          item.recurrence === 'FIXED' ? { id: item.id, scope, month, year } : { id: item.id },
        );
      }
      for (const item of allExtraExpenses) {
        if (item.status === 'PAID') await revertExtra.mutateAsync(item.id);
        await deleteExtra.mutateAsync(
          item.recurrence === 'FIXED' ? { id: item.id, scope, month, year } : { id: item.id },
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : t('page.clearAllError'));
    } finally {
      setClearingAll(false);
      setShowClearAllScope(false);
    }
  }

  async function handleClearAll() {
    if (clearAllCount === 0) return;
    try {
      if (!(await confirm(t('page.confirmClearAll', { count: clearAllCount })))) return;
    } catch (err) {
      showError(err instanceof Error ? err.message : t('page.clearAllError'));
      return;
    }
    if (hasFixedToClear) setShowClearAllScope(true);
    else await runClearAll();
  }

  const txSaving =
    createPayment.isPending || updatePayment.isPending ||
    createExtra.isPending || updateExtra.isPending;

  const rxSaving = createIncome.isPending || updateIncome.isPending;

  // ── Per-row pending ids (evita clique duplo em ações de linha) ──────────────
  const entriesPendingToggleId =
    (receiveItem.isPending && (receiveItem.variables as string)) ||
    (revertIncome.isPending && (revertIncome.variables as string)) ||
    null;
  const entriesPendingDeleteId =
    (deleteIncome.isPending && (deleteIncome.variables?.id as string)) ||
    (revertIncome.isPending && (revertIncome.variables as string)) ||
    null;

  const paymentsPendingToggleId =
    (payPayment.isPending && (payPayment.variables as string)) ||
    (revertPayment.isPending && (revertPayment.variables as string)) ||
    null;
  const paymentsPendingDeleteId =
    (deletePayment.isPending && (deletePayment.variables?.id as string)) ||
    (revertPayment.isPending && (revertPayment.variables as string)) ||
    null;

  const extrasPendingToggleId =
    (payExtra.isPending && (payExtra.variables as string)) ||
    (revertExtra.isPending && (revertExtra.variables as string)) ||
    null;
  const extrasPendingDeleteId =
    (deleteExtra.isPending && (deleteExtra.variables?.id as string)) ||
    (revertExtra.isPending && (revertExtra.variables as string)) ||
    null;

  const invoicesPendingRevertId =
    (revertInvoice.isPending && (revertInvoice.variables?.invoiceId as string)) || null;

  const transferSaving = createTransfer.isPending || updateTransfer.isPending;
  const transfersPendingRevertId = (revertTransfer.isPending && (revertTransfer.variables as string)) || null;
  const transfersPendingDeleteId = (deleteTransfer.isPending && (deleteTransfer.variables as string)) || null;

  return (
    <div>
      <div className="space-y-4">
        {/* Filtros */}
        <CashFlowFilterBar
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          categories={categories}
          excludedCategoryIds={excludedCategoryIds}
          onToggleCategory={toggleCategoryFilter}
          onSelectAllCategories={() => setExcludedCategoryIds(new Set())}
          onClearCategories={() => setExcludedCategoryIds(new Set(categories.map((c) => c.id)))}
          onClearAll={handleClearAll}
          onNewTransfer={() => setModal({ type: 'transfer', mode: 'create' })}
          clearingAll={clearingAll}
          clearAllDisabled={clearAllCount === 0}
        />

        {/* Transferências entre contas */}
        <TransferGrid
          items={data.transfers}
          onAdd={() => setModal({ type: 'transfer', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'transfer', mode: 'edit', item })}
          onRevert={(transferGroupId) => revertTransfer.mutate(transferGroupId)}
          onDelete={handleDeleteTransfer}
          pendingRevertId={transfersPendingRevertId}
          pendingDeleteId={transfersPendingDeleteId}
          locked={clearingAll}
        />

        {/* Entradas */}
        <EntriesGrid
          items={filteredEntries}
          accounts={accounts as Account[]}
          onAdd={() => setModal({ type: 'income', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'income', mode: 'edit', item })}
          onReceive={(id) => receiveItem.mutate(id)}
          onRevert={(id) => revertIncome.mutate(id)}
          onDelete={handleDeleteIncome}
          pendingToggleId={entriesPendingToggleId}
          pendingDeleteId={entriesPendingDeleteId}
          locked={clearingAll}
        />

        {/* Pagamentos */}
        <TransactionGrid
          title={t('page.paymentsTitle')}
          icon={<TrendingDown size={16} className="text-red-500" />}
          items={filteredPayments}
          accounts={accounts as Account[]}
          onAdd={() => setModal({ type: 'payment', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'payment', mode: 'edit', item })}
          onPay={(id) => payPayment.mutate(id)}
          onRevert={(id) => revertPayment.mutate(id)}
          onDelete={(item) => handleDeleteTransaction('payment', item)}
          pendingToggleId={paymentsPendingToggleId}
          pendingDeleteId={paymentsPendingDeleteId}
          locked={clearingAll}
        />

        {/* Gastos Extraordinários */}
        <TransactionGrid
          title={t('page.extraExpensesTitle')}
          icon={<TrendingDown size={16} className="text-orange-500" />}
          items={filteredExtraExpenses}
          accounts={accounts as Account[]}
          onAdd={() => setModal({ type: 'extra-expense', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'extra-expense', mode: 'edit', item })}
          onPay={(id) => payExtra.mutate(id)}
          onRevert={(id) => revertExtra.mutate(id)}
          onDelete={(item) => handleDeleteTransaction('extra-expense', item)}
          pendingToggleId={extrasPendingToggleId}
          pendingDeleteId={extrasPendingDeleteId}
          locked={clearingAll}
        />

        {/* Cartões de Crédito */}
        <CreditCardsGrid
          items={filteredCreditCards}
          cardNames={cardNames}
          onPay={(inv) => setInvoicePayTarget(inv)}
          onRevert={(inv) => revertInvoice.mutate({ cardId: inv.creditCardId, invoiceId: inv.id })}
          onOpenInvoice={handleOpenInvoice}
          pendingRevertId={invoicesPendingRevertId}
        />
      </div>

      {/* Summary bar */}
      <PageFooter>
        <SummaryBar
          summary={summary}
          expanded={summaryExpanded}
          onToggleExpanded={() => setSummaryExpanded((e) => !e)}
        />
      </PageFooter>

      {/* Income Modal */}
      <IncomeModal
        open={modal?.type === 'income'}
        onClose={closeModal}
        item={modal?.type === 'income' ? modal.item : undefined}
        categories={categories}
        accounts={accounts as Account[]}
        mainAccountId={accountId}
        month={month}
        year={year}
        onSave={saveIncome}
        isSaving={rxSaving}
        onReceive={(id) => { receiveItem.mutate(id); }}
        onDelete={handleDeleteIncome}
      />

      {/* Transaction Modal */}
      {(modal?.type === 'payment' || modal?.type === 'extra-expense') && (
        <TransactionModal
          open
          onClose={closeModal}
          type={modal.type}
          item={modal.item}
          categories={categories}
          accounts={accounts as Account[]}
          mainAccountId={accountId}
          month={month}
          year={year}
          onSave={saveTransaction}
          isSaving={txSaving}
          onPay={handleTxPay}
          onDelete={(item) => handleDeleteTransaction(modal.type, item)}
        />
      )}

      {/* Transfer Modal */}
      <TransferModal
        open={modal?.type === 'transfer'}
        onClose={closeModal}
        item={modal?.type === 'transfer' ? modal.item : undefined}
        accountId={accountId}
        accounts={accounts as Account[]}
        onSave={saveTransfer}
        isSaving={transferSaving}
        onRevert={(transferGroupId) => revertTransfer.mutate(transferGroupId)}
        onDelete={handleDeleteTransfer}
      />

      {/* Scoped delete for fixed (recurring) entries */}
      <ScopedDeleteModal
        open={!!fixedDeleteTarget}
        onClose={() => setFixedDeleteTarget(null)}
        title={t('page.scopedDelete.title')}
        loading={deleteIncome.isPending || deletePayment.isPending || deleteExtra.isPending}
        description={
          <>
            <strong>{fixedDeleteTarget?.item.description}</strong> {t('page.scopedDelete.description')}
          </>
        }
        onDeleteCurrent={() => runScopedDelete('CURRENT')}
        onDeleteFuture={() => runScopedDelete('CURRENT_AND_FUTURE')}
      />

      {/* Scoped edit for fixed (recurring) entries */}
      <ScopedDeleteModal
        open={!!fixedEditTarget}
        onClose={() => setFixedEditTarget(null)}
        title={t('page.scopedEdit.title')}
        loading={updateIncome.isPending || updatePayment.isPending || updateExtra.isPending}
        description={
          <>
            <strong>{fixedEditTarget?.item.description}</strong> {t('page.scopedEdit.description')}
          </>
        }
        onDeleteCurrent={() => runScopedEdit('CURRENT')}
        onDeleteFuture={() => runScopedEdit('CURRENT_AND_FUTURE')}
      />

      {/* Scoped delete for "clear all" when the reference includes fixed (recurring) entries */}
      <ScopedDeleteModal
        open={showClearAllScope}
        onClose={() => setShowClearAllScope(false)}
        title={t('page.scopedClearAll.title')}
        loading={clearingAll}
        description={t('page.scopedClearAll.description')}
        onDeleteCurrent={() => runClearAll('CURRENT')}
        onDeleteFuture={() => runClearAll('CURRENT_AND_FUTURE')}
      />

      {/* Invoice payment account picker */}
      <PayInvoiceAccountModal
        open={!!invoicePayTarget}
        onClose={() => setInvoicePayTarget(null)}
        accounts={accounts as Account[]}
        isPaying={payInvoice.isPending}
        onConfirm={(accountId) => {
          if (invoicePayTarget) {
            payInvoice.mutate({
              cardId: invoicePayTarget.creditCardId,
              invoiceId: invoicePayTarget.id,
              accountId,
            });
          }
        }}
      />
    </div>
  );
}
