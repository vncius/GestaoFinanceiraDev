import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { Account, Category, Receivable, RecurrenceType } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { DateInput } from '../../../components/ui/DateInput';
import { CreateReceivablePayload } from '../../../services/receivables.service';
import { formatCurrency, floatToCents, centsToFloat } from '../../../utils/money';
import { todayISO, toInputDate } from '../../../utils/date';
import { useDialog } from '../../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../../utils/validation';
import { RECURRENCE_LABELS } from '../types';
import { Field, INPUT } from './shared';

interface ReceivableFormState {
  description: string;
  expectedPaymentDate: string;
  grossAmount: string;
  separateReservePercentage: boolean;
  incomeCategoryId: string;
  targetAccountId: string;
  notes: string;
  recurrence: RecurrenceType;
}

export function ReceivableModal({
  open,
  onClose,
  item,
  categories,
  accounts,
  mainAccountId,
  reserveAccountId,
  defaultReservePct,
  onSave,
  isSaving,
  onReceive,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item?: Receivable;
  categories: Category[];
  accounts: Account[];
  mainAccountId: string | null;
  reserveAccountId: string | null;
  defaultReservePct: number;
  onSave: (data: CreateReceivablePayload) => void;
  isSaving: boolean;
  onReceive?: (id: string) => void;
  onDelete?: (item: Receivable) => void;
}) {
  const isEdit = !!item;
  const incomeCategories = categories.filter((c) => c.type === 'INCOME');
  const selectableAccounts = accounts.filter(
    (a) => a.active && (a.id === mainAccountId || a.id === reserveAccountId),
  );

  const init = (): ReceivableFormState => ({
    description: item?.description ?? '',
    expectedPaymentDate: item ? toInputDate(item.expectedPaymentDate) : todayISO(),
    grossAmount: item ? String(centsToFloat(item.grossAmount)) : '',
    separateReservePercentage: item?.separateReservePercentage ?? true,
    incomeCategoryId: item?.incomeCategoryId ?? (incomeCategories[0]?.id ?? ''),
    targetAccountId: item?.targetAccountId ?? mainAccountId ?? '',
    notes: item?.notes ?? '',
    recurrence: item?.recurrence ?? 'UNIQUE',
  });

  const [form, setForm] = useState<ReceivableFormState>(init);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const grossCents = floatToCents(parseFloat(form.grossAmount) || 0);
  const isReserveTarget = !!reserveAccountId && form.targetAccountId === reserveAccountId;
  const effectiveSeparate = isReserveTarget ? false : form.separateReservePercentage;
  const pct = effectiveSeparate ? defaultReservePct : 0;
  const reserveCents = Math.round((grossCents * pct) / 100);
  const netCents = grossCents - reserveCents;

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = getMissingFields([
      { label: 'Descrição', valid: !!form.description },
      { label: 'Categoria', valid: !!form.incomeCategoryId },
      { label: 'Valor bruto', valid: !!grossCents },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      description: form.description,
      expectedPaymentDate: new Date(form.expectedPaymentDate).toISOString(),
      grossAmount: grossCents,
      separateReservePercentage: effectiveSeparate,
      incomeCategoryId: form.incomeCategoryId,
      targetAccountId: form.targetAccountId || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
    });
  }

  const set = (k: keyof ReceivableFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar Recebimento' : 'Novo Recebimento'}
      footer={
        <>
          {isEdit && item?.status !== 'CANCELED' && onDelete && (
            <button
              type="button"
              title="Excluir"
              onClick={() => { onClose(); onDelete(item!); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          {isEdit && item?.status === 'EXPECTED' && onReceive && (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              onClick={() => { onReceive(item!.id); onClose(); }}
            >
              Receber
            </Button>
          )}
          <Button loading={isSaving} onClick={handleSubmit as never}>Salvar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Descrição *">
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria *">
            <select className={INPUT} value={form.incomeCategoryId} onChange={set('incomeCategoryId')} required>
              <option value="">Selecione...</option>
              {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Data prevista *">
            <DateInput className={INPUT} value={form.expectedPaymentDate} onChange={(v) => setForm((f) => ({ ...f, expectedPaymentDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor bruto *">
            <CurrencyInput
              className={INPUT}
              value={form.grossAmount}
              onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))}
            />
          </Field>
          {isEdit && item?.recurrence === 'FIXED' ? (
            <Field label="Tipo de lançamento">
              <div className={`${INPUT} bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>
                {RECURRENCE_LABELS.FIXED}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Para encerrar a recorrência, exclua "esta e as futuras".
              </p>
            </Field>
          ) : (
            <Field label="Tipo de lançamento">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          {selectableAccounts.length > 0 && (
            <Field label="Conta de destino">
              <select
                className={INPUT}
                value={form.targetAccountId}
                onChange={(e) => setForm((f) => ({ ...f, targetAccountId: e.target.value }))}
              >
                {selectableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!isReserveTarget && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.separateReservePercentage}
              onChange={(e) => setForm((f) => ({ ...f, separateReservePercentage: e.target.checked }))}
              className="rounded"
            />
            Separar reserva ({defaultReservePct}%)
          </label>
        )}
        {grossCents > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <div className="flex justify-between"><span>Reserva ({pct}%)</span><span className="font-medium">{formatCurrency(reserveCents)}</span></div>
            <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100"><span>Valor líquido</span><span className="text-green-700 dark:text-green-400">{formatCurrency(netCents)}</span></div>
          </div>
        )}
        <Field label="Observações">
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
