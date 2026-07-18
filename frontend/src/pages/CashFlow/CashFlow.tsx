import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMonth } from '../../contexts/MonthContext';
import { CashFlowService, CreateTransactionPayload } from '../../services/cash-flow.service';
import { CreateReceivablePayload } from '../../services/receivables.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import { AccountsService } from '../../services/accounts.service';
import { Account, CreditCardInvoice, FinancialTransaction, Receivable } from '../../types';
import { ScopedDeleteModal } from '../../components/ui/ScopedDeleteModal';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { PayInvoiceAccountModal } from '../../components/ui/PayInvoiceAccountModal';
import { monthYearFromDate } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { PageFooter } from '../../contexts/PageFooterContext';
import { ModalKind, CashFlowTypeFilter } from './types';
import { useCashFlowMutations } from './useCashFlowMutations';
import { SummaryBar } from './components/SummaryBar';
import { EntriesGrid } from './components/EntriesGrid';
import { TransactionGrid } from './components/TransactionGrid';
import { CreditCardsGrid } from './components/CreditCardsGrid';
import { ReceivableModal } from './components/ReceivableModal';
import { TransactionModal } from './components/TransactionModal';
import { CashFlowFilterBar } from './components/CashFlowFilterBar';

export default function CashFlow() {
  const { t } = useTranslation('cashFlow');
  const { month, year } = useMonth();
  const navigate = useNavigate();

  const { confirm } = useDialog();

  const { data, isLoading } = useQuery({
    queryKey: ['cashFlow', month, year],
    queryFn: () => CashFlowService.get(month, year),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: SettingsService.get,
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
    | { kind: 'receivable'; item: Receivable }
    | { kind: 'payment' | 'extra-expense'; item: FinancialTransaction }
    | null
  >(null);

  const {
    createReceivable,
    updateReceivable,
    receiveItem,
    revertReceivable,
    deleteReceivable,
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
  } = useCashFlowMutations({
    month,
    year,
    closeModal,
    clearFixedDeleteTarget: () => setFixedDeleteTarget(null),
    clearInvoicePayTarget: () => setInvoicePayTarget(null),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const EFFECTED_CONFIRM = t('page.confirmEdit');
  const EFFECTED_DELETE_CONFIRM = t('page.confirmDeleteEffected');

  async function saveReceivable(payload: CreateReceivablePayload) {
    if (modal?.type !== 'receivable') return;
    if (modal.item?.status === 'RECEIVED' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      updateReceivable.mutate({ id: modal.item.id, data: payload });
    } else {
      createReceivable.mutate(payload);
    }
  }

  async function saveTransaction(payload: CreateTransactionPayload) {
    if (modal?.type !== 'payment' && modal?.type !== 'extra-expense') return;
    const isPayment = modal.type === 'payment';
    if (modal.item?.status === 'PAID' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      if (isPayment) updatePayment.mutate({ id: modal.item.id, data: payload });
      else updateExtra.mutate({ id: modal.item.id, data: payload });
    } else {
      if (isPayment) createPayment.mutate(payload);
      else createExtra.mutate(payload);
    }
  }

  function handleTxPay(id: string) {
    if (modal?.type === 'payment') payPayment.mutate(id);
    else if (modal?.type === 'extra-expense') payExtra.mutate(id);
  }

  function handleOpenInvoice(inv: CreditCardInvoice) {
    navigate('/credit-cards', { state: { cardId: inv.creditCardId } });
  }

  async function handleDeleteReceivable(item: Receivable) {
    if (item.recurrence === 'FIXED') { setFixedDeleteTarget({ kind: 'receivable', item }); return; }
    const isReceived = item.status === 'RECEIVED';
    if (!(await confirm(isReceived ? EFFECTED_DELETE_CONFIRM : t('page.confirmDelete')))) return;
    if (isReceived) await revertReceivable.mutateAsync(item.id);
    deleteReceivable.mutate({ id: item.id });
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
    const { month: m, year: y } = monthYearFromDate(
      fixedDeleteTarget.kind === 'receivable'
        ? fixedDeleteTarget.item.expectedPaymentDate
        : fixedDeleteTarget.item.expectedDate,
    );
    if (fixedDeleteTarget.kind === 'receivable') {
      if (fixedDeleteTarget.item.status === 'RECEIVED') await revertReceivable.mutateAsync(fixedDeleteTarget.item.id);
      deleteReceivable.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
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
    () => (showIncome && data ? data.entries.filter((item) => !excludedCategoryIds.has(item.incomeCategoryId)) : []),
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

  if (isLoading || !data) return <PageLoading />;

  const { summary } = data;

  const txSaving =
    createPayment.isPending || updatePayment.isPending ||
    createExtra.isPending || updateExtra.isPending;

  const rxSaving = createReceivable.isPending || updateReceivable.isPending;

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
        />

        {/* Entradas */}
        <EntriesGrid
          items={filteredEntries}
          accounts={accounts as Account[]}
          onAdd={() => setModal({ type: 'receivable', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'receivable', mode: 'edit', item })}
          onReceive={(id) => receiveItem.mutate(id)}
          onRevert={(id) => revertReceivable.mutate(id)}
          onDelete={handleDeleteReceivable}
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
        />

        {/* Cartões de Crédito */}
        <CreditCardsGrid
          items={filteredCreditCards}
          cardNames={cardNames}
          onPay={(inv) => setInvoicePayTarget(inv)}
          onRevert={(inv) => revertInvoice.mutate({ cardId: inv.creditCardId, invoiceId: inv.id })}
          onOpenInvoice={handleOpenInvoice}
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

      {/* Receivable Modal */}
      <ReceivableModal
        open={modal?.type === 'receivable'}
        onClose={closeModal}
        item={modal?.type === 'receivable' ? modal.item : undefined}
        categories={categories}
        accounts={accounts as Account[]}
        mainAccountId={settings?.mainAccountId ?? null}
        onSave={saveReceivable}
        isSaving={rxSaving}
        onReceive={(id) => { receiveItem.mutate(id); }}
        onDelete={handleDeleteReceivable}
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
          mainAccountId={settings?.mainAccountId ?? null}
          month={month}
          year={year}
          onSave={saveTransaction}
          isSaving={txSaving}
          onPay={handleTxPay}
          onDelete={(item) => handleDeleteTransaction(modal.type, item)}
        />
      )}

      {/* Scoped delete for fixed (recurring) entries */}
      <ScopedDeleteModal
        open={!!fixedDeleteTarget}
        onClose={() => setFixedDeleteTarget(null)}
        title={t('page.scopedDelete.title')}
        loading={deleteReceivable.isPending || deletePayment.isPending || deleteExtra.isPending}
        description={
          <>
            <strong>{fixedDeleteTarget?.item.description}</strong> {t('page.scopedDelete.description')}
          </>
        }
        onDeleteCurrent={() => runScopedDelete('CURRENT')}
        onDeleteFuture={() => runScopedDelete('CURRENT_AND_FUTURE')}
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
