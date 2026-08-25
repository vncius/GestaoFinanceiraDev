import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account, Category, FinancialTransaction, RecurrenceType } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { DateInput } from '../../../components/ui/DateInput';
import { CreateIncomePayload } from '../../../services/cash-flow.service';
import { floatToCents, centsToFloat } from '../../../utils/money';
import { toInputDate, firstDayOfMonthISO } from '../../../utils/date';
import { useDialog } from '../../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../../utils/validation';
import { useRecurrenceLabels } from '../types';
import { Field, INPUT } from './shared';

interface IncomeFormState {
  description: string;
  categoryId: string;
  amount: string;
  expectedDate: string;
  accountId: string;
  notes: string;
  recurrence: RecurrenceType;
}

export function IncomeModal({
  open,
  onClose,
  item,
  categories,
  accounts,
  mainAccountId,
  month,
  year,
  onSave,
  isSaving,
  onReceive,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item?: FinancialTransaction;
  categories: Category[];
  accounts: Account[];
  mainAccountId: string | null;
  month: number;
  year: number;
  onSave: (data: CreateIncomePayload) => void;
  isSaving: boolean;
  onReceive?: (id: string) => void;
  onDelete?: (item: FinancialTransaction) => void;
}) {
  const { t } = useTranslation('cashFlow');
  const RECURRENCE_LABELS = useRecurrenceLabels();
  const isEdit = !!item;
  const incomeCategories = categories.filter((c) => c.type === 'INCOME');
  const activeAccounts = accounts.filter((a) => a.active);

  const init = (): IncomeFormState => ({
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? (incomeCategories[0]?.id ?? ''),
    amount: item ? String(centsToFloat(item.amount)) : '',
    expectedDate: item ? toInputDate(item.expectedDate) : firstDayOfMonthISO(month, year),
    accountId: item?.targetAccountId ?? mainAccountId ?? '',
    notes: item?.notes ?? '',
    recurrence: item?.recurrence ?? 'UNIQUE',
  });

  const [form, setForm] = useState<IncomeFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: t('incomeModal.validation.description'), valid: !!form.description },
      { label: t('incomeModal.validation.category'), valid: !!form.categoryId },
      { label: t('incomeModal.validation.amount'), valid: !!amount },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      description: form.description,
      categoryId: form.categoryId,
      amount,
      expectedDate: new Date(form.expectedDate).toISOString(),
      targetAccountId: form.accountId || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
    });
  }

  const set = (k: keyof IncomeFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('incomeModal.title.edit') : t('incomeModal.title.new')}
      footer={
        <>
          {isEdit && (item?.status === 'PENDING' || item?.status === 'RECEIVED') && onDelete && (
            <button
              type="button"
              title={t('incomeModal.delete')}
              aria-label={t('incomeModal.delete')}
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('incomeModal.cancel')}</Button>
          {isEdit && item?.status === 'PENDING' && onReceive && (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              onClick={() => { onReceive(item!.id); onClose(); }}
            >
              {t('incomeModal.receive')}
            </Button>
          )}
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('incomeModal.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('incomeModal.fields.description')}>
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('incomeModal.fields.category')}>
            <select className={INPUT} value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">{t('incomeModal.fields.selectPlaceholder')}</option>
              {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('incomeModal.fields.expectedDate')}>
            <DateInput className={INPUT} value={form.expectedDate} onChange={(v) => setForm((f) => ({ ...f, expectedDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('incomeModal.fields.amount')}>
            <CurrencyInput
              className={INPUT}
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </Field>
          <Field label={t('incomeModal.fields.targetAccount')}>
            <select className={INPUT} value={form.accountId} onChange={set('accountId')}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {isEdit && item?.recurrence === 'FIXED' ? (
          <Field label={t('incomeModal.fields.recurrenceType')}>
            <div className={`${INPUT} bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>
              {RECURRENCE_LABELS.FIXED}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('incomeModal.fixedRecurrenceHint')}
            </p>
          </Field>
        ) : (
          <Field label={t('incomeModal.fields.recurrenceType')}>
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
        <Field label={t('incomeModal.fields.notes')}>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
