import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account, Category, FinancialTransaction, RecurrenceType } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { DateInput } from '../../../components/ui/DateInput';
import { CreateTransactionPayload } from '../../../services/cash-flow.service';
import { floatToCents, centsToFloat } from '../../../utils/money';
import { toInputDate, firstDayOfMonthISO } from '../../../utils/date';
import { useDialog } from '../../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../../utils/validation';
import { useRecurrenceLabels } from '../types';
import { Field, INPUT } from './shared';

interface TxFormState {
  description: string;
  categoryId: string;
  amount: string;
  expectedDate: string;
  accountId: string;
  notes: string;
  recurrence: RecurrenceType;
}

export function TransactionModal({
  open,
  onClose,
  type,
  item,
  categories,
  accounts,
  mainAccountId,
  month,
  year,
  onSave,
  isSaving,
  onPay,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  type: 'payment' | 'extra-expense';
  item?: FinancialTransaction;
  categories: Category[];
  accounts: Account[];
  mainAccountId: string | null;
  month: number;
  year: number;
  onSave: (data: CreateTransactionPayload) => void;
  isSaving: boolean;
  onPay?: (id: string) => void;
  onDelete?: (item: FinancialTransaction) => void;
}) {
  const { t } = useTranslation('cashFlow');
  const RECURRENCE_LABELS = useRecurrenceLabels();
  const isEdit = !!item;
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const activeAccounts = accounts.filter((a) => a.active);
  const title = type === 'payment'
    ? (isEdit ? t('transactionModal.title.editPayment') : t('transactionModal.title.newPayment'))
    : (isEdit ? t('transactionModal.title.editExtraExpense') : t('transactionModal.title.newExtraExpense'));

  const init = (): TxFormState => ({
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? (expenseCategories[0]?.id ?? ''),
    amount: item ? String(centsToFloat(item.amount)) : '',
    expectedDate: item ? toInputDate(item.expectedDate) : firstDayOfMonthISO(month, year),
    accountId: item?.sourceAccountId ?? mainAccountId ?? '',
    notes: item?.notes ?? '',
    recurrence: item?.recurrence ?? 'UNIQUE',
  });

  const [form, setForm] = useState<TxFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: t('transactionModal.validation.description'), valid: !!form.description },
      { label: t('transactionModal.validation.category'), valid: !!form.categoryId },
      { label: t('transactionModal.validation.amount'), valid: !!amount },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      description: form.description,
      categoryId: form.categoryId,
      amount,
      expectedDate: new Date(form.expectedDate).toISOString(),
      sourceAccountId: form.accountId || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
    });
  }

  const set = (k: keyof TxFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {isEdit && (item?.status === 'PENDING' || item?.status === 'PAID') && onDelete && (
            <button
              type="button"
              title={t('transactionModal.delete')}
              aria-label={t('transactionModal.delete')}
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('transactionModal.cancel')}</Button>
          {isEdit && item?.status === 'PENDING' && onPay && (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              onClick={() => { onPay(item!.id); onClose(); }}
            >
              {t('transactionModal.pay')}
            </Button>
          )}
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('transactionModal.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('transactionModal.fields.description')}>
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('transactionModal.fields.category')}>
            <select className={INPUT} value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">{t('transactionModal.fields.selectPlaceholder')}</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('transactionModal.fields.entryDate')}>
            <DateInput className={INPUT} value={form.expectedDate} onChange={(v) => setForm((f) => ({ ...f, expectedDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('transactionModal.fields.amount')}>
            <CurrencyInput
              className={INPUT}
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </Field>
          <Field label={t('transactionModal.fields.debitAccount')}>
            <select className={INPUT} value={form.accountId} onChange={set('accountId')}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {isEdit && item?.recurrence === 'FIXED' ? (
          <Field label={t('transactionModal.fields.recurrenceType')}>
            <div className={`${INPUT} bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>
              {RECURRENCE_LABELS.FIXED}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('transactionModal.fixedRecurrenceHint')}
            </p>
          </Field>
        ) : (
          <Field label={t('transactionModal.fields.recurrenceType')}>
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
        <Field label={t('transactionModal.fields.notes')}>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
