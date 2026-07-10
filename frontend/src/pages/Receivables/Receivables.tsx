import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, Pencil, Trash2, Plus } from 'lucide-react';
import {
  ReceivablesService,
  CreateReceivablePayload,
} from '../../services/receivables.service';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import { AccountsService } from '../../services/accounts.service';
import { Account, Category, Receivable, RecurrenceType } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ScopedDeleteModal } from '../../components/ui/ScopedDeleteModal';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';
import { formatDate, toInputDate, todayISO, monthYearFromDate } from '../../utils/date';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { DateInput } from '../../components/ui/DateInput';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';

// ── Types & constants ─────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'EXPECTED' | 'RECEIVED' | 'CANCELED';

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

function PaidToggle({ paid, onToggle }: { paid: boolean; onToggle: () => void }) {
  const { t } = useTranslation('receivables');
  const label = paid ? t('toggle.revert') : t('toggle.markReceived');
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onToggle}
      className={`p-1 sm:p-1.5 rounded-md transition-colors ${
        paid
          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {paid ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
    </button>
  );
}

// ── Receivable Modal ──────────────────────────────────────────────────────────

interface FormState {
  description: string;
  incomeCategoryId: string;
  expectedPaymentDate: string;
  grossAmount: string;
  reserveAccountIds: string[];
  customerName: string;
  invoiceNumber: string;
  notes: string;
  recurrence: RecurrenceType;
}

function ReceivableModal({
  open,
  onClose,
  item,
  categories,
  accounts,
  mainAccountId,
  onSave,
  isSaving,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item?: Receivable;
  categories: Category[];
  accounts: Account[];
  mainAccountId: string | null;
  onSave: (data: CreateReceivablePayload) => void;
  isSaving: boolean;
  onDelete?: (item: Receivable) => void;
}) {
  const { t } = useTranslation('receivables');
  const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
    UNIQUE: t('recurrence.unique'),
    FIXED: t('recurrence.fixed'),
  };
  const isEdit = !!item;
  const incomeCats = categories.filter((c) => c.type === 'INCOME' && c.active);
  const reserveEligibleAccounts = accounts.filter(
    (a) => a.active && a.autoReserveEnabled && a.id !== mainAccountId,
  );

  const init = (): FormState => ({
    description: item?.description ?? '',
    incomeCategoryId: item?.incomeCategoryId ?? (incomeCats[0]?.id ?? ''),
    expectedPaymentDate: item ? toInputDate(item.expectedPaymentDate) : todayISO(),
    grossAmount: item ? String(centsToFloat(item.grossAmount)) : '',
    reserveAccountIds: item
      ? (item.reserveAllocations ?? []).map((a) => a.accountId)
      : reserveEligibleAccounts.map((a) => a.id),
    customerName: item?.customerName ?? '',
    invoiceNumber: item?.invoiceNumber ?? '',
    notes: item?.notes ?? '',
    recurrence: item?.recurrence ?? 'UNIQUE',
  });

  const [form, setForm] = useState<FormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const selectedReserveAccounts = reserveEligibleAccounts.filter((a) =>
    form.reserveAccountIds.includes(a.id),
  );
  const grossCents = floatToCents(parseFloat(form.grossAmount) || 0);
  const reserveCents = selectedReserveAccounts.reduce(
    (s, a) => s + Math.round((grossCents * a.autoReservePercentage) / 100),
    0,
  );
  const netCents = grossCents - reserveCents;

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function toggleReserveAccount(accountId: string) {
    setForm((f) => ({
      ...f,
      reserveAccountIds: f.reserveAccountIds.includes(accountId)
        ? f.reserveAccountIds.filter((id) => id !== accountId)
        : [...f.reserveAccountIds, accountId],
    }));
  }

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = getMissingFields([
      { label: t('modal.validation.description'), valid: !!form.description },
      { label: t('modal.validation.category'), valid: !!form.incomeCategoryId },
      { label: t('modal.validation.grossAmount'), valid: !!grossCents },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      description: form.description,
      incomeCategoryId: form.incomeCategoryId,
      expectedPaymentDate: new Date(form.expectedPaymentDate).toISOString(),
      grossAmount: grossCents,
      reserveAccountIds: selectedReserveAccounts.map((a) => a.id),
      customerName: form.customerName || null,
      invoiceNumber: form.invoiceNumber || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('modal.editTitle') : t('modal.newTitle')}
      size="lg"
      footer={
        <>
          {isEdit && onDelete && (
            <button
              type="button"
              title={t('actions.delete')}
              aria-label={t('actions.delete')}
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('modal.cancel')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('modal.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('modal.fields.description')}>
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.fields.category')}>
            <select className={INPUT} value={form.incomeCategoryId} onChange={set('incomeCategoryId')} required>
              <option value="">{t('modal.fields.selectPlaceholder')}</option>
              {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('modal.fields.expectedDate')}>
            <DateInput className={INPUT} value={form.expectedPaymentDate} onChange={(v) => setForm((f) => ({ ...f, expectedPaymentDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.fields.grossAmount')}>
            <CurrencyInput
              className={INPUT}
              value={form.grossAmount}
              onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))}
            />
          </Field>
          <Field label={t('modal.fields.customer')}>
            <input className={INPUT} value={form.customerName} onChange={set('customerName')} placeholder={t('modal.fields.customerPlaceholder')} />
          </Field>
        </div>
        {isEdit && item?.recurrence === 'FIXED' ? (
          <Field label={t('modal.fields.recurrenceType')}>
            <div className={`${INPUT} bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>
              {RECURRENCE_LABELS.FIXED}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('modal.fixedRecurrenceHint')}
            </p>
          </Field>
        ) : (
          <Field label={t('modal.fields.recurrenceType')}>
            <select
              className={INPUT}
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceType }))}
            >
              {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        )}
        {reserveEligibleAccounts.length > 0 && (
          <div className="space-y-1.5">
            {reserveEligibleAccounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.reserveAccountIds.includes(a.id)}
                  onChange={() => toggleReserveAccount(a.id)}
                  className="rounded"
                />
                {t('modal.reserveCheckbox', { percentage: a.autoReservePercentage, account: a.name })}
              </label>
            ))}
          </div>
        )}
        {grossCents > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <div className="flex justify-between">
              <span>{t('modal.summary.reserve')}</span>
              <span>{formatCurrency(reserveCents)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100">
              <span>{t('modal.summary.netAmount')}</span>
              <span className="text-green-700 dark:text-green-400">{formatCurrency(netCents)}</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.fields.invoiceNumber')}>
            <input className={INPUT} value={form.invoiceNumber} onChange={set('invoiceNumber')} placeholder={t('modal.fields.invoiceNumberPlaceholder')} />
          </Field>
          <Field label={t('modal.fields.notes')}>
            <input className={INPUT} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Receivables() {
  const { t } = useTranslation('receivables');
  const STATUS_LABELS: Record<StatusFilter, string> = {
    ALL: t('status.all'),
    EXPECTED: t('status.expected'),
    RECEIVED: t('status.received'),
    CANCELED: t('status.canceled'),
  };
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ item?: Receivable } | null>(null);
  const [fixedDeleteTarget, setFixedDeleteTarget] = useState<Receivable | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['receivables'],
    queryFn: ReceivablesService.findAll,
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
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: 30_000,
  });

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['receivables'] });
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createMut = useMutation({
    mutationFn: ReceivablesService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateReceivablePayload> }) =>
      ReceivablesService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const receiveMut = useMutation({
    mutationFn: (id: string) => ReceivablesService.receive(id),
    onSuccess: invalidate,
  });
  const revertMut = useMutation({
    mutationFn: ReceivablesService.revert,
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: ({ id, scope, month, year }: { id: string; scope?: 'CURRENT' | 'CURRENT_AND_FUTURE'; month?: number; year?: number }) =>
      ReceivablesService.remove(id, scope ? { scope, month: month!, year: year! } : undefined),
    onSuccess: () => { invalidate(); setFixedDeleteTarget(null); },
  });

  const { confirm } = useDialog();

  const EFFECTED_CONFIRM = t('modal.confirmEdit');
  const EFFECTED_DELETE_CONFIRM = t('modal.confirmDeleteReceived');

  async function save(payload: CreateReceivablePayload) {
    if (modal?.item?.status === 'RECEIVED' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal?.item) {
      updateMut.mutate({ id: modal.item.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  async function handleDelete(item: Receivable) {
    if (item.recurrence === 'FIXED') { setFixedDeleteTarget(item); return; }
    const isReceived = item.status === 'RECEIVED';
    if (!(await confirm(isReceived ? EFFECTED_DELETE_CONFIRM : t('modal.confirmDelete')))) return;
    if (isReceived) await revertMut.mutateAsync(item.id);
    deleteMut.mutate({ id: item.id });
  }

  async function runScopedDelete(scope: 'CURRENT' | 'CURRENT_AND_FUTURE') {
    if (!fixedDeleteTarget) return;
    const { month, year } = monthYearFromDate(fixedDeleteTarget.expectedPaymentDate);
    if (fixedDeleteTarget.status === 'RECEIVED') await revertMut.mutateAsync(fixedDeleteTarget.id);
    deleteMut.mutate({ id: fixedDeleteTarget.id, scope, month, year });
  }

  const filtered = items
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter(
      (r) =>
        !search ||
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        (r.customerName ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.expectedPaymentDate).getTime() - new Date(a.expectedPaymentDate).getTime()
  );

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(['ALL', 'EXPECTED', 'RECEIVED', 'CANCELED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {STATUS_LABELS[s]}
              {s !== 'ALL' && (
                <span className="ml-1 opacity-70">
                  ({items.filter((r) => r.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-full sm:w-52 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('toolbar.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={<Plus size={14} />} onClick={() => setModal({})} className="shrink-0">
            {t('toolbar.new')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {sorted.length === 0 ? (
          <EmptyState
            title={t('emptyState.title')}
            description={t('emptyState.description')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 sm:px-5 py-3 font-medium">{t('table.description')}</th>
                  <th className="hidden md:table-cell text-left px-3 py-3 font-medium">{t('table.customer')}</th>
                  <th className="hidden md:table-cell text-left px-3 py-3 font-medium">{t('table.category')}</th>
                  <th className="hidden lg:table-cell text-right px-3 py-3 font-medium">{t('table.gross')}</th>
                  <th className="text-right px-2 sm:px-3 py-3 font-medium">{t('table.net')}</th>
                  <th className="hidden lg:table-cell text-left px-3 py-3 font-medium">{t('table.expectedDate')}</th>
                  <th className="hidden lg:table-cell text-left px-3 py-3 font-medium">{t('table.receivedDate')}</th>
                  <th className="px-1 sm:px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {sorted.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer" onClick={() => setModal({ item })}>
                    <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[110px] md:max-w-none truncate">
                      {item.description}
                      {item.invoiceNumber && (
                        <span className="ml-1.5 text-xs text-gray-400 font-normal">
                          {t('table.invoicePrefix', { number: item.invoiceNumber })}
                        </span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {item.customerName ?? t('table.emptyValue')}
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {catMap.get(item.incomeCategoryId) ?? t('table.emptyValue')}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(item.grossAmount)}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">
                      {formatCurrency(item.netAmount)}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">
                      {formatDate(item.expectedPaymentDate)}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">
                      {item.actualPaymentDate ? formatDate(item.actualPaymentDate) : t('table.emptyValue')}
                    </td>
                    <td className="px-1 sm:px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0 sm:gap-0.5">
                        {item.status !== 'CANCELED' && (
                          <PaidToggle
                            paid={item.status === 'RECEIVED'}
                            onToggle={() =>
                              item.status === 'RECEIVED' ? revertMut.mutate(item.id) : receiveMut.mutate(item.id)
                            }
                          />
                        )}
                        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.status !== 'CANCELED' && (
                            <button
                              title={t('actions.edit')}
                              aria-label={t('actions.edit')}
                              onClick={() => setModal({ item })}
                              className="p-1 sm:p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            title={t('actions.delete')}
                            aria-label={t('actions.delete')}
                            onClick={() => handleDelete(item)}
                            className="p-1 sm:p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceivableModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        categories={categories}
        accounts={accounts}
        mainAccountId={settings?.mainAccountId ?? null}
        onSave={save}
        isSaving={createMut.isPending || updateMut.isPending}
        onDelete={handleDelete}
      />

      <ScopedDeleteModal
        open={!!fixedDeleteTarget}
        onClose={() => setFixedDeleteTarget(null)}
        title={t('scopedDelete.title')}
        loading={deleteMut.isPending}
        description={
          <>
            <strong>{fixedDeleteTarget?.description}</strong> {t('scopedDelete.description')}
          </>
        }
        onDeleteCurrent={() => runScopedDelete('CURRENT')}
        onDeleteFuture={() => runScopedDelete('CURRENT_AND_FUTURE')}
      />
    </div>
  );
}
