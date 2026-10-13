import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Account, CreditCard } from '../../types';
import { CreateCreditCardPayload } from '../../services/credit-cards.service';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CurrencyInput } from '../ui/CurrencyInput';
import { centsToFloat, floatToCents } from '../../utils/money';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';
import { sortByName } from '../../utils/sort';

// Cadastro/edição de cartão — usado em Configurações → Cartões e na própria
// tela de Cartões (U13 do plano de UX).

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

interface CardFormState {
  name: string;
  bank: string;
  closingDay: string;
  dueDay: string;
  limit: string;
  defaultPaymentAccountId: string;
}

export function CardSettingsModal({
  open,
  onClose,
  item,
  accounts,
  onSave,
  onDelete,
  isSaving,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  item?: CreditCard;
  accounts: Account[];
  onSave: (data: CreateCreditCardPayload) => void;
  onDelete?: () => void;
  isSaving: boolean;
  // Conta sugerida na criação (ex.: a conta selecionada na tela de Cartões).
  defaultAccountId?: string | null;
}) {
  const { t } = useTranslation('settings');
  const activeAccounts = sortByName(accounts.filter((a) => a.active));
  const mainAccountId =
    activeAccounts.find((a) => a.id === defaultAccountId)?.id ?? activeAccounts[0]?.id ?? '';

  const init = (): CardFormState => ({
    name: item?.name ?? '',
    bank: item?.bank ?? '',
    closingDay: item ? String(item.closingDay) : '10',
    dueDay: item ? String(item.dueDay) : '20',
    limit: item ? String(centsToFloat(item.limit)) : '',
    // Pagadora atual só se ainda for uma conta ativa (senão o select mostraria
    // uma opção e o form guardaria outra); caso contrário, sugere a primeira.
    defaultPaymentAccountId: activeAccounts.some((a) => a.id === item?.defaultPaymentAccountId)
      ? (item?.defaultPaymentAccountId as string)
      : mainAccountId,
  });

  const [form, setForm] = useState<CardFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  const set =
    (k: keyof CardFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limit = floatToCents(parseFloat(form.limit) || 0);
    const missing = getMissingFields([
      { label: t('validation.nameLabel'), valid: !!form.name },
      { label: t('validation.bankLabel'), valid: !!form.bank },
      { label: t('validation.limitLabel'), valid: !!limit },
      { label: t('cards.modal.defaultAccountLabel'), valid: !!form.defaultPaymentAccountId },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      name: form.name,
      bank: form.bank,
      closingDay: parseInt(form.closingDay) || 10,
      dueDay: parseInt(form.dueDay) || 20,
      limit,
      defaultPaymentAccountId: form.defaultPaymentAccountId,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('cards.modal.editTitle') : t('cards.modal.newTitle')}
      footer={
        <>
          {item && onDelete && (
            <button
              type="button"
              title={t('actions.deactivate')}
              aria-label={t('actions.deactivate')}
              onClick={() => { onClose(); onDelete(); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('actions.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('cards.modal.nameLabel')}>
            <input className={INPUT} value={form.name} onChange={set('name')} required />
          </Field>
          <Field label={t('cards.modal.bankLabel')}>
            <input className={INPUT} value={form.bank} onChange={set('bank')} required />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('cards.modal.closingDayLabel')}>
            <input
              type="number"
              min="1"
              max="28"
              className={INPUT}
              value={form.closingDay}
              onChange={set('closingDay')}
            />
          </Field>
          <Field label={t('cards.modal.dueDayLabel')}>
            <input
              type="number"
              min="1"
              max="28"
              className={INPUT}
              value={form.dueDay}
              onChange={set('dueDay')}
            />
          </Field>
          <Field label={t('cards.modal.limitLabel')}>
            <CurrencyInput
              className={INPUT}
              value={form.limit}
              onChange={(v) => setForm((f) => ({ ...f, limit: v }))}
            />
          </Field>
        </div>
        <Field label={t('cards.modal.defaultAccountLabel')}>
          <select
            className={INPUT}
            value={form.defaultPaymentAccountId}
            onChange={set('defaultPaymentAccountId')}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}
