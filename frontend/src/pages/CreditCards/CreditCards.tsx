import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  CreditCard as CreditCardIcon,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import {
  CreditCardsService,
  CreateCardEntryPayload,
} from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { AccountsService } from '../../services/accounts.service';
import { Category, CreditCard, CreditCardEntry, CreditCardInvoice } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ScopedDeleteModal } from '../../components/ui/ScopedDeleteModal';
import { invoiceStatusBadge } from '../../components/ui/Badge';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { DateInput } from '../../components/ui/DateInput';
import { PayInvoiceAccountModal } from '../../components/ui/PayInvoiceAccountModal';
import { IconActionButton } from '../../components/ui/IconActionButton';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';
import { formatDate, formatMonthYear, firstDayOfMonthISO, toInputDate } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

// ── Entry Modal ───────────────────────────────────────────────────────────────

interface EntryFormState {
  description: string;
  expenseCategoryId: string;
  totalAmount: string;
  purchaseDate: string;
  entryType: 'CASH' | 'FIXED' | 'INSTALLMENT';
  installmentsCount: string;
  notes: string;
}

function EntryModal({
  open,
  onClose,
  categories,
  item,
  month,
  year,
  onSave,
  onDelete,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  item?: CreditCardEntry;
  month: number;
  year: number;
  onSave: (data: CreateCardEntryPayload | Parameters<typeof CreditCardsService.updateEntry>[2]) => void;
  onDelete?: (item: CreditCardEntry) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('creditCards');
  const ENTRY_TYPE_LABELS: Record<string, string> = {
    CASH: t('entryModal.entryTypes.cash'),
    FIXED: t('entryModal.entryTypes.fixed'),
    INSTALLMENT: t('entryModal.entryTypes.installment'),
  };
  const expenseCats = categories.filter((c) => c.type === 'EXPENSE' && c.active);
  const isEdit = !!item;

  const init = (): EntryFormState => ({
    description: item?.description ?? '',
    expenseCategoryId: item?.expenseCategoryId ?? (expenseCats[0]?.id ?? ''),
    totalAmount: item ? String(centsToFloat(item.totalAmount)) : '',
    purchaseDate: item ? toInputDate(item.purchaseDate) : firstDayOfMonthISO(month, year),
    entryType: (item?.entryType as EntryFormState['entryType']) ?? 'CASH',
    installmentsCount: item ? String(item.installmentsCount) : '2',
    notes: item?.notes ?? '',
  });

  const [form, setForm] = useState<EntryFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const set =
    (k: keyof EntryFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const { alert, confirm } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = floatToCents(parseFloat(form.totalAmount) || 0);
    const missing = getMissingFields([
      { label: t('entryModal.validation.description'), valid: !!form.description },
      { label: t('entryModal.validation.category'), valid: !!form.expenseCategoryId },
      { label: t('entryModal.validation.totalAmount'), valid: !!cents },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }

    if (isEdit) {
      const willRecreate =
        cents !== item!.totalAmount ||
        new Date(form.purchaseDate).toISOString() !== item!.purchaseDate ||
        form.entryType !== item!.entryType ||
        (form.entryType === 'INSTALLMENT' && parseInt(form.installmentsCount) !== item!.installmentsCount);

      if (willRecreate && !(await confirm(
        t('entryModal.confirmRecreate')
      ))) return;

      onSave({
        description: form.description,
        expenseCategoryId: form.expenseCategoryId,
        totalAmount: cents,
        purchaseDate: new Date(form.purchaseDate).toISOString(),
        entryType: form.entryType,
        installmentsCount: form.entryType === 'INSTALLMENT' ? parseInt(form.installmentsCount) : undefined,
        notes: form.notes || null,
      });
    } else {
      onSave({
        description: form.description,
        expenseCategoryId: form.expenseCategoryId,
        totalAmount: cents,
        purchaseDate: new Date(form.purchaseDate).toISOString(),
        entryType: form.entryType,
        installmentsCount: form.entryType === 'INSTALLMENT' ? parseInt(form.installmentsCount) : undefined,
        notes: form.notes || null,
      } as CreateCardEntryPayload);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('entryModal.title.edit') : t('entryModal.title.new')}
      footer={
        <>
          {isEdit && onDelete && (
            <IconActionButton
              title={t('installments.actions.cancel')}
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 !rounded-lg"
            >
              <Trash2 size={16} />
            </IconActionButton>
          )}
          <Button variant="secondary" onClick={onClose}>{t('entryModal.cancelButton')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{isEdit ? t('entryModal.saveButton') : t('entryModal.addButton')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('entryModal.fields.description')}>
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('entryModal.fields.category')}>
            <select className={INPUT} value={form.expenseCategoryId} onChange={set('expenseCategoryId')} required>
              <option value="">{t('entryModal.fields.categoryPlaceholder')}</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('entryModal.fields.purchaseDate')}>
            <DateInput className={INPUT} value={form.purchaseDate} onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('entryModal.fields.totalAmount')}>
            <CurrencyInput
              className={INPUT}
              value={form.totalAmount}
              onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))}
            />
          </Field>
          <Field label={t('entryModal.fields.type')}>
            <select
              className={INPUT}
              value={form.entryType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  entryType: e.target.value as EntryFormState['entryType'],
                }))
              }
            >
              {Object.entries(ENTRY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.entryType === 'INSTALLMENT' && (
          <Field label={t('entryModal.fields.installmentsCount')}>
            <input
              type="number"
              min="2"
              max="60"
              className={INPUT}
              value={form.installmentsCount}
              onChange={set('installmentsCount')}
              required
            />
          </Field>
        )}
        <Field label={t('entryModal.fields.notes')}>
          <input className={INPUT} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Card Detail ───────────────────────────────────────────────────────────────

function CardDetail({
  card,
  month,
  year,
}: {
  card: CreditCard;
  month: number;
  year: number;
}) {
  const { t } = useTranslation('creditCards');
  const qc = useQueryClient();
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryToEdit, setEntryToEdit] = useState<CreditCardEntry | undefined>(undefined);
  const [invoicePayTarget, setInvoicePayTarget] = useState<CreditCardInvoice | null>(null);
  const [fixedDeleteTarget, setFixedDeleteTarget] = useState<CreditCardEntry | null>(null);

  const flowKey = ['creditCards', 'flow', card.id, month, year] as const;

  const { data: flow, isLoading } = useQuery({
    queryKey: flowKey,
    queryFn: () => CreditCardsService.getFlow(card.id, month, year),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: Infinity,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: flowKey });
    qc.invalidateQueries({ queryKey: ['creditCards'] });
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const { confirm } = useDialog();

  const addEntryMut = useMutation({
    mutationFn: (payload: CreateCardEntryPayload) =>
      CreditCardsService.createEntry(card.id, payload),
    onSuccess: () => { invalidate(); setShowEntryModal(false); },
  });
  const updateEntryMut = useMutation({
    mutationFn: (payload: Parameters<typeof CreditCardsService.updateEntry>[2]) =>
      CreditCardsService.updateEntry(card.id, entryToEdit!.id, payload),
    onSuccess: () => { invalidate(); setEntryToEdit(undefined); },
  });
  const deleteEntryMut = useMutation({
    mutationFn: ({
      entryId,
      scope,
    }: {
      entryId: string;
      scope?: 'CURRENT' | 'CURRENT_AND_FUTURE';
    }) =>
      CreditCardsService.deleteEntry(
        card.id,
        entryId,
        scope ? { scope, month, year } : undefined,
      ),
    onSuccess: () => { invalidate(); setFixedDeleteTarget(null); },
  });
  const payMut = useMutation({
    mutationFn: ({ invoiceId, accountId }: { invoiceId: string; accountId?: string }) =>
      CreditCardsService.payInvoice(card.id, invoiceId, accountId ? { paymentAccountId: accountId } : undefined),
    onSuccess: () => { invalidate(); setInvoicePayTarget(null); },
  });
  const revertMut = useMutation({
    mutationFn: (invoiceId: string) => CreditCardsService.revertInvoice(card.id, invoiceId),
    onSuccess: invalidate,
  });

  const pendingDeleteEntryId =
    deleteEntryMut.isPending ? (deleteEntryMut.variables?.entryId as string) ?? null : null;

  async function handleDeleteEntry(entry: CreditCardEntry) {
    if (entry.entryType === 'FIXED') {
      setFixedDeleteTarget(entry);
    } else if (await confirm(t('installments.confirmCancel'))) {
      deleteEntryMut.mutate({ entryId: entry.id });
    }
  }

  if (isLoading) return <PageLoading />;
  if (!flow) return null;

  const { invoice, installments, entries, summary } = flow;
  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const activeInstallments = installments.filter((i) => i.status !== 'CANCELED');

  return (
    <div className="space-y-4">
      {/* Invoice header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {t('invoiceHeader.title', { monthYear: formatMonthYear(month, year) })}
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {card.name} · {card.bank}
            </p>
            {invoice?.dueDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {t('invoiceHeader.dueDate', { date: formatDate(invoice.dueDate) })}
              </p>
            )}
          </div>
          <div>
            {invoice
              ? invoiceStatusBadge(invoice.status)
              : <span className="text-xs text-gray-400 dark:text-gray-500">{t('invoiceHeader.noInvoice')}</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
          <div className="text-center p-2 sm:p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('invoiceHeader.summary.invoiceTotal')}</p>
            <p className="text-sm lg:text-lg font-bold text-gray-800 dark:text-gray-100 truncate">{formatCurrency(summary.invoiceTotal)}</p>
          </div>
          <div className="text-center p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('invoiceHeader.summary.paid')}</p>
            <p className="text-sm lg:text-lg font-bold text-green-600 dark:text-green-400 truncate">{formatCurrency(summary.paidAmount)}</p>
          </div>
          <div className="text-center p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('invoiceHeader.summary.open')}</p>
            <p className="text-sm lg:text-lg font-bold text-red-500 dark:text-red-400 truncate">{formatCurrency(summary.openAmount)}</p>
          </div>
        </div>

        {invoice && (
          <div className="flex gap-2">
            {(invoice.status === 'OPEN' || invoice.status === 'OVERDUE') && (
              <Button
                size="sm"
                icon={<CheckCircle2 size={14} />}
                onClick={() => setInvoicePayTarget(invoice)}
                loading={payMut.isPending}
              >
                {t('invoiceHeader.payButton')}
              </Button>
            )}
            {invoice.status === 'PAID' && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={14} />}
                onClick={() => revertMut.mutate(invoice.id)}
                loading={revertMut.isPending}
              >
                {t('invoiceHeader.revertButton')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Installments table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t('installments.title', { count: activeInstallments.length })}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            onClick={() => setShowEntryModal(true)}
          >
            {t('installments.addButton')}
          </Button>
        </div>

        {activeInstallments.length === 0 ? (
          <EmptyState
            title={t('installments.emptyState.title')}
            description={t('installments.emptyState.description')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 sm:px-5 py-2.5 font-medium">{t('installments.table.description')}</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 font-medium">{t('installments.table.category')}</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 font-medium">{t('installments.table.purchaseDate')}</th>
                  <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">{t('installments.table.installment')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('installments.table.amount')}</th>
                  <th className="px-1 sm:px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {activeInstallments.map((inst) => {
                  const entry = entryMap.get(inst.creditCardEntryId);
                  return (
                    <tr
                      key={inst.id}
                      className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group ${entry?.active ? 'cursor-pointer' : ''}`}
                      onClick={() => { if (entry?.active) setEntryToEdit(entry); }}
                    >
                      <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[110px] lg:max-w-none truncate">
                        {entry?.description ?? '—'}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {entry ? (catMap.get(entry.expenseCategoryId) ?? '—') : '—'}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">
                        {entry ? formatDate(entry.purchaseDate) : '—'}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {entry?.entryType === 'CASH'
                          ? t('installments.entryType.cash')
                          : entry?.entryType === 'FIXED'
                          ? t('installments.entryType.fixed')
                          : `${inst.installmentNumber}/${inst.totalInstallments}`}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">
                        {formatCurrency(inst.amount)}
                      </td>
                      <td className="px-1 sm:px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {entry?.active && (
                            <IconActionButton
                              title={t('installments.actions.edit')}
                              onClick={() => { setEntryToEdit(entry); }}
                              disabled={pendingDeleteEntryId === entry.id}
                              className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Pencil size={14} />
                            </IconActionButton>
                          )}
                          {entry?.active && (
                            <IconActionButton
                              title={t('installments.actions.cancel')}
                              onClick={() => handleDeleteEntry(entry)}
                              loading={pendingDeleteEntryId === entry.id}
                              className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                            >
                              <Trash2 size={14} />
                            </IconActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EntryModal
        open={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        categories={categories}
        month={month}
        year={year}
        onSave={(payload) => addEntryMut.mutate(payload as CreateCardEntryPayload)}
        isSaving={addEntryMut.isPending}
      />

      <EntryModal
        open={!!entryToEdit}
        onClose={() => setEntryToEdit(undefined)}
        categories={categories}
        item={entryToEdit}
        month={month}
        year={year}
        onSave={(payload) => updateEntryMut.mutate(payload as Parameters<typeof CreditCardsService.updateEntry>[2])}
        onDelete={handleDeleteEntry}
        isSaving={updateEntryMut.isPending}
      />

      <ScopedDeleteModal
        open={!!fixedDeleteTarget}
        onClose={() => setFixedDeleteTarget(null)}
        title={t('fixedDeleteModal.title')}
        loading={deleteEntryMut.isPending}
        description={
          <>
            <strong>{fixedDeleteTarget?.description}</strong>{' '}
            {t('fixedDeleteModal.description', { monthYear: formatMonthYear(month, year) })}
          </>
        }
        onDeleteCurrent={() =>
          fixedDeleteTarget &&
          deleteEntryMut.mutate({ entryId: fixedDeleteTarget.id, scope: 'CURRENT' })
        }
        onDeleteFuture={() =>
          fixedDeleteTarget &&
          deleteEntryMut.mutate({ entryId: fixedDeleteTarget.id, scope: 'CURRENT_AND_FUTURE' })
        }
      />

      <PayInvoiceAccountModal
        open={!!invoicePayTarget}
        onClose={() => setInvoicePayTarget(null)}
        accounts={accounts}
        isPaying={payMut.isPending}
        onConfirm={(accountId) => {
          if (invoicePayTarget) {
            payMut.mutate({ invoiceId: invoicePayTarget.id, accountId });
          }
        }}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditCards() {
  const { t } = useTranslation('creditCards');
  const { month, year } = useMonth();
  const location = useLocation();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  useEffect(() => {
    const cardId = (location.state as { cardId?: string } | null)?.cardId;
    if (cardId) setSelectedCardId(cardId);
  }, [location.state]);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['creditCards', month, year],
    queryFn: () => CreditCardsService.findAll(month, year),
  });

  const activeCards = cards.filter((c) => c.active);
  const selectedCard = activeCards.find((c) => c.id === selectedCardId) ?? null;

  if (isLoading) return <PageLoading />;

  if (activeCards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <EmptyState
          title={t('cardList.emptyState.title')}
          description={t('cardList.emptyState.description')}
          icon={<CreditCardIcon size={24} className="text-gray-300" />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0">
      {/* Card list */}
      <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:w-60 lg:shrink-0 pb-1 lg:pb-0">
        {activeCards.map((card) => (
          <button
            key={card.id}
            onClick={() => setSelectedCardId(card.id)}
            className={`text-left p-4 rounded-xl border transition-all w-64 shrink-0 lg:w-full ${
              selectedCardId === card.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{card.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{card.bank}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0 mt-1" />
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 dark:text-gray-500">{t('cardList.currentMonth')}</span>
                <span className="font-semibold text-red-500 dark:text-red-400">
                  {formatCurrency(card.currentMonthAmount)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 dark:text-gray-500">{t('cardList.limit')}</span>
                <span className="text-gray-600 dark:text-gray-300">{formatCurrency(card.limit)}</span>
              </div>
              {card.currentInvoice && (
                <div className="pt-1">{invoiceStatusBadge(card.currentInvoice.status)}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Card detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedCard ? (
          <CardDetail card={selectedCard} month={month} year={year} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title={t('selectCard.title')}
              description={t('selectCard.description')}
              icon={<CreditCardIcon size={24} className="text-gray-300" />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
