import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { firstDayOfMonthISO, lastDayOfMonthISO, monthYearFromDate } from '../../utils/date';
import { BackupService } from '../../services/backup.service';
import { Modal } from '../../components/ui/Modal';
import { StatementImportSection } from '../Backup/Backup';
import { useDialog } from '../../contexts/DialogContext';
import { useToast } from '../../contexts/ToastContext';
import { ModalKind, CashFlowTypeFilter } from './types';
import { useCashFlowMutations } from './useCashFlowMutations';
import { SummaryBar } from './components/SummaryBar';
import { MovementsList, NewMovementKind, RowBusy } from './components/MovementsList';
import { filterMovements, groupBySituation, MovementItem, MovementKind, MovementTag, toMovements } from './movements';
import { useCollapsibleSections } from './useCollapsibleSections';
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
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  // ── Summary bar state ────────────────────────────────────────────────────────
  // Vive no componente da página (que não desmonta ao trocar de mês) para que
  // o estado expandido/recolhido sobreviva à troca de referência.
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // Cards recolhíveis: vazios iniciam recolhidos; preferência persistida por tenant.
  const sections = useCollapsibleSections();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<CashFlowTypeFilter>('ALL');
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<MovementTag>>(new Set());
  const toggleTag = (tag: MovementTag) =>
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
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
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    settleTransfer,
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

  // Excluir uma transferência já efetivada primeiro a reverte, para que o
  // valor volte às duas contas (origem e destino) antes de o par ser
  // cancelado — mesmo protocolo das entradas e pagamentos efetivados.
  async function handleDeleteTransfer(item: TransferFlowItem) {
    const isSettled = item.status === 'PAID' || item.status === 'RECEIVED';
    if (!(await confirm(isSettled ? EFFECTED_DELETE_CONFIRM : t('page.confirmDelete')))) return;
    if (isSettled) await revertTransfer.mutateAsync(item.transferGroupId);
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

  // ── Limpar referência (entradas, pagamentos, gastos extras e transferências) ─
  // Cartões de crédito têm seu próprio botão de limpeza (fatura), por isso
  // ficam de fora aqui.
  const allEntries = data.entries;
  const allPayments = data.payments;
  const allExtraExpenses = data.extraExpenses;
  const allTransfers = data.transfers;
  const clearAllCount =
    allEntries.length + allPayments.length + allExtraExpenses.length + allTransfers.length;
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
      // Transferências sempre são únicas (não têm recorrência fixa), então não
      // entram no escopo atual/futuras — mas a perna excluída aqui leva junto a
      // da outra conta, porque o cancelamento é por transferGroupId.
      for (const item of allTransfers) {
        if (item.status === 'PAID' || item.status === 'RECEIVED') {
          await revertTransfer.mutateAsync(item.transferGroupId);
        }
        await deleteTransfer.mutateAsync(item.transferGroupId);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : t('page.clearAllError'));
    } finally {
      setClearingAll(false);
      setShowClearAllScope(false);
    }
  }

  async function handleExportMonth() {
    setExporting(true);
    try {
      await BackupService.downloadCsv({ from: firstDayOfMonthISO(month, year), to: lastDayOfMonthISO(month, year) });
    } catch (err) {
      showError(err instanceof Error ? err.message : t('page.exportError'));
    } finally {
      setExporting(false);
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
  // Efetivar e reverter dividem a mesma caixa de pago — qualquer uma das duas
  // mutations em voo trava a linha correspondente.
  const transfersPendingToggleId =
    (settleTransfer.isPending && (settleTransfer.variables as string)) ||
    (revertTransfer.isPending && (revertTransfer.variables as string)) ||
    null;
  const transfersPendingDeleteId = (deleteTransfer.isPending && (deleteTransfer.variables as string)) || null;

  // ── Lista única (U10a) ───────────────────────────────────────────────────────
  // Transferências só aparecem em "Todos": não são entrada nem saída (D2/D8).
  const movementGroups = groupBySituation(
    filterMovements(toMovements({
      entries: filteredEntries,
      payments: filteredPayments,
      extraExpenses: filteredExtraExpenses,
      transfers: typeFilter === 'ALL' ? data.transfers : [],
      creditCards: filteredCreditCards,
      cardNames,
      cardFallbackName: t('creditCardsGrid.cardFallbackName'),
    }), { search, tags: tagFilter, categoryNames }),
  );
  const isFiltering = search.trim() !== '' || tagFilter.size > 0;

  const PENDING_IDS: Record<MovementKind, { toggle: string | null; del: string | null }> = {
    income: { toggle: entriesPendingToggleId, del: entriesPendingDeleteId },
    payment: { toggle: paymentsPendingToggleId, del: paymentsPendingDeleteId },
    extra: { toggle: extrasPendingToggleId, del: extrasPendingDeleteId },
    transfer: { toggle: transfersPendingToggleId, del: transfersPendingDeleteId },
    invoice: { toggle: invoicesPendingRevertId, del: null },
  };
  const rowBusy = (item: MovementItem): RowBusy => {
    const ids = PENDING_IDS[item.kind];
    if (ids.toggle === item.actionId) return 'toggle';
    if (ids.del === item.actionId) return 'delete';
    return null;
  };

  function handleToggle({ source, settled }: MovementItem) {
    switch (source.kind) {
      case 'income': return settled ? revertIncome.mutate(source.item.id) : receiveItem.mutate(source.item.id);
      case 'payment': return settled ? revertPayment.mutate(source.item.id) : payPayment.mutate(source.item.id);
      case 'extra': return settled ? revertExtra.mutate(source.item.id) : payExtra.mutate(source.item.id);
      case 'transfer':
        return settled
          ? revertTransfer.mutate(source.item.transferGroupId)
          : settleTransfer.mutate(source.item.transferGroupId);
      case 'invoice':
        return settled
          ? revertInvoice.mutate({ cardId: source.item.creditCardId, invoiceId: source.item.id })
          : setInvoicePayTarget(source.item);
    }
  }

  function handleEdit({ source }: MovementItem) {
    switch (source.kind) {
      case 'income': return setModal({ type: 'income', mode: 'edit', item: source.item });
      case 'payment': return setModal({ type: 'payment', mode: 'edit', item: source.item });
      case 'extra': return setModal({ type: 'extra-expense', mode: 'edit', item: source.item });
      case 'transfer': return setModal({ type: 'transfer', mode: 'edit', item: source.item });
      case 'invoice': return handleOpenInvoice(source.item);
    }
  }

  function handleDelete({ source }: MovementItem) {
    switch (source.kind) {
      case 'income': return handleDeleteIncome(source.item);
      case 'payment': return handleDeleteTransaction('payment', source.item);
      case 'extra': return handleDeleteTransaction('extra-expense', source.item);
      case 'transfer': return handleDeleteTransfer(source.item);
      case 'invoice': return undefined;
    }
  }

  function handleNew(kind: NewMovementKind) {
    const type = kind === 'extra' ? 'extra-expense' : kind;
    setModal({ type, mode: 'create' } as ModalKind);
  }

  return (
    <div>
      <div className="space-y-4">
        {/* Resumo do mês (U9): no topo, antes das listas */}
        <SummaryBar
          summary={summary}
          month={month}
          year={year}
          expanded={summaryExpanded}
          onToggleExpanded={() => setSummaryExpanded((e) => !e)}
        />

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
          onImportStatement={() => setImportOpen(true)}
          onExportMonth={handleExportMonth}
          exporting={exporting}
          clearingAll={clearingAll}
          clearAllDisabled={clearAllCount === 0}
          search={search}
          onSearchChange={setSearch}
          tags={tagFilter}
          onToggleTag={toggleTag}
          onClearTags={() => setTagFilter(new Set())}
        />

        {/* Lista única (U10a): entradas, saídas, transferências e faturas
            agrupadas em Atrasados → A vencer → Concluídos */}
        <MovementsList
          groups={movementGroups}
          categoryNames={categoryNames}
          rowBusy={rowBusy}
          locked={clearingAll}
          doneExpanded={sections.isExpanded('done', movementGroups.done.length > 0, false)}
          onToggleDone={() => sections.toggle('done', movementGroups.done.length > 0, false)}
          canTransfer={accounts.length > 1}
          onNew={handleNew}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage={isFiltering ? t('movements.noResults') : undefined}
        />
      </div>


      {/* Importar extrato (menu "⋯") — mesma seção de Configurações → Seus dados */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t('filterBar.importStatement')} size="xl">
        <StatementImportSection embedded defaultAccountId={accountId} onImported={() => setImportOpen(false)} />
      </Modal>

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
        month={month}
        year={year}
        onSave={saveTransfer}
        isSaving={transferSaving}
        onSettle={(transferGroupId) => settleTransfer.mutate(transferGroupId)}
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
