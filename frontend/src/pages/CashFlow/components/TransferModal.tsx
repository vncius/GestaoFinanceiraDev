import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account, TransferFlowItem } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { DateInput } from '../../../components/ui/DateInput';
import { CreateTransferPayload } from '../../../services/transfers.service';
import { floatToCents, centsToFloat } from '../../../utils/money';
import { toInputDate, defaultEntryDateISO } from '../../../utils/date';
import { useDialog } from '../../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../../utils/validation';
import { Field, INPUT } from './shared';

interface TransferFormState {
  description: string;
  amount: string;
  date: string;
  sourceAccountId: string;
  targetAccountId: string;
  notes: string;
}

export function TransferModal({
  open,
  onClose,
  item,
  accountId,
  accounts,
  month,
  year,
  onSave,
  isSaving,
  onRevert,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item?: TransferFlowItem;
  accountId: string;
  accounts: Account[];
  month: number;
  year: number;
  onSave: (data: CreateTransferPayload) => void;
  isSaving: boolean;
  onRevert?: (transferGroupId: string) => void;
  onDelete?: (item: TransferFlowItem) => void;
}) {
  const { t } = useTranslation('cashFlow');
  const isEdit = !!item;
  const activeAccounts = accounts.filter((a) => a.active);

  const init = (): TransferFormState => {
    if (item) {
      const isOut = item.direction === 'OUT';
      return {
        description: item.description,
        amount: String(centsToFloat(item.amount)),
        date: toInputDate(item.expectedDate),
        sourceAccountId: isOut ? accountId : item.counterpartAccountId,
        targetAccountId: isOut ? item.counterpartAccountId : accountId,
        notes: item.notes ?? '',
      };
    }
    const fallbackTarget = activeAccounts.find((a) => a.id !== accountId)?.id ?? '';
    return {
      description: '',
      amount: '',
      date: defaultEntryDateISO(month, year),
      sourceAccountId: accountId,
      targetAccountId: fallbackTarget,
      notes: '',
    };
  };

  const [form, setForm] = useState<TransferFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: t('transferModal.validation.description'), valid: !!form.description },
      { label: t('transferModal.validation.amount'), valid: !!amount },
      { label: t('transferModal.validation.sourceAccount'), valid: !!form.sourceAccountId },
      { label: t('transferModal.validation.targetAccount'), valid: !!form.targetAccountId },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    if (form.sourceAccountId === form.targetAccountId) {
      await alert(t('transferModal.validation.sameAccount'));
      return;
    }
    onSave({
      description: form.description,
      amount,
      date: new Date(form.date).toISOString(),
      sourceAccountId: form.sourceAccountId,
      targetAccountId: form.targetAccountId,
      notes: form.notes || null,
    });
  }

  const set = (k: keyof TransferFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const isSettled = item?.status === 'PAID' || item?.status === 'RECEIVED';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('transferModal.title.edit') : t('transferModal.title.new')}
      footer={
        <>
          {isEdit && item?.status === 'PENDING' && onDelete && (
            <button
              type="button"
              title={t('transferModal.delete')}
              aria-label={t('transferModal.delete')}
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('transferModal.cancel')}</Button>
          {isEdit && isSettled && onRevert && (
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              onClick={() => { onRevert(item!.transferGroupId); onClose(); }}
            >
              {t('transferModal.revert')}
            </Button>
          )}
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('transferModal.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('transferModal.fields.description')}>
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('transferModal.fields.sourceAccount')}>
            <select className={INPUT} value={form.sourceAccountId} onChange={set('sourceAccountId')}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('transferModal.fields.targetAccount')}>
            <select className={INPUT} value={form.targetAccountId} onChange={set('targetAccountId')}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('transferModal.fields.amount')}>
            <CurrencyInput
              className={INPUT}
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </Field>
          <Field label={t('transferModal.fields.date')}>
            <DateInput className={INPUT} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} required />
          </Field>
        </div>
        <Field label={t('transferModal.fields.notes')}>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
