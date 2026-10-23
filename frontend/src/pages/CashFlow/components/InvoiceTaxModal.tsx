import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Lock, RotateCcw } from 'lucide-react';
import { Account, FinancialTransaction } from '../../../types';
import { CashFlowService } from '../../../services/cash-flow.service';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { DateInput } from '../../../components/ui/DateInput';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { centsToFloat, floatToCents, formatCurrency } from '../../../utils/money';
import { formatDate, toInputDate } from '../../../utils/date';
import { competenceOfOriginId, formatRateBps } from '../../../utils/invoice-tax';
import { sortByName } from '../../../utils/sort';
import { Field, INPUT } from './shared';

export interface InvoiceTaxSave {
  expectedDate: string;
  sourceAccountId: string | null;
  notes: string | null;
}

// Despesa "Imposto a pagar" (I8): o valor é a soma do imposto das NFs e não
// se edita; vencimento, conta pagadora e observações sim (decisão 5). A baixa
// aceita o valor real do DAS (A5).
export function InvoiceTaxModal({
  open,
  onClose,
  expense,
  accounts,
  saving,
  paying,
  onSave,
  onPay,
  onRevert,
}: {
  open: boolean;
  onClose: () => void;
  expense: FinancialTransaction | null;
  accounts: Account[];
  saving: boolean;
  paying: boolean;
  onSave: (data: InvoiceTaxSave) => void;
  onPay: (amountPaid: number) => void;
  onRevert: () => void;
}) {
  const { t } = useTranslation('cashFlow');
  const activeAccounts = sortByName(accounts.filter((a) => a.active));

  const { data: detail, isLoading } = useQuery({
    queryKey: ['invoiceTax', expense?.id],
    queryFn: () => CashFlowService.getInvoiceTax(expense!.id),
    enabled: open && !!expense,
    staleTime: 0,
  });

  const [dueDate, setDueDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [lastOpen, setLastOpen] = useState(false);
  if (open && expense && !lastOpen) {
    setDueDate(toInputDate(expense.expectedDate));
    setAccountId(expense.sourceAccountId ?? '');
    setNotes(expense.notes ?? '');
    setAmountPaid(String(centsToFloat(expense.amount)));
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  if (!expense) return null;

  const paid = expense.status === 'PAID';
  const competence = competenceOfOriginId(expense.originId);
  const calculatedDiffers = !!detail && detail.calculatedTotal !== expense.amount;

  function handleSave() {
    if (!dueDate) return;
    onSave({
      expectedDate: new Date(dueDate).toISOString(),
      sourceAccountId: accountId || null,
      notes: notes || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('invoiceTax.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('movementForm.cancel')}</Button>
          {paid ? (
            <Button variant="secondary" icon={<RotateCcw size={14} />} loading={paying} onClick={onRevert}>
              {t('invoiceTax.revert')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              loading={paying}
              onClick={() => onPay(floatToCents(parseFloat(amountPaid) || 0) || expense.amount)}
            >
              {t('movementForm.markPaid')}
            </Button>
          )}
          <Button loading={saving} onClick={handleSave} disabled={!dueDate}>{t('movementForm.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {competence ? t('invoiceTax.competence', { month: competence }) : expense.description}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold text-red-600 dark:text-red-400">
              <Lock size={16} className="text-gray-400" aria-hidden />
              {formatCurrency(expense.amount)}
            </p>
            {calculatedDiffers && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('invoiceTax.calculated', { amount: formatCurrency(detail!.calculatedTotal) })}
              </p>
            )}
          </div>
          {paid && expense.actualDate && (
            <span className="shrink-0 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400">
              {t('invoiceTax.paidOn', { date: formatDate(expense.actualDate) })}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('invoiceTax.amountHint')}</p>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('invoiceTax.invoicesTitle', { count: detail?.invoices.length ?? 0 })}
          </h3>
          {isLoading ? (
            <LoadingSpinner className="!py-4" message={t('invoiceTax.loading')} />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
              {detail?.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-gray-800 dark:text-gray-100">{inv.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('invoiceTax.invoiceLine', {
                        date: formatDate(inv.issueDate),
                        amount: formatCurrency(inv.amount),
                        rate: formatRateBps(inv.taxRateBps),
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium text-gray-700 dark:text-gray-200">{formatCurrency(inv.tax)}</span>
                </li>
              ))}
              {detail && detail.invoices.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{t('invoiceTax.noInvoices')}</li>
              )}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('invoiceTax.dueDate')}>
            <DateInput className={INPUT} value={dueDate} onChange={setDueDate} required />
          </Field>
          {!paid && (
            <Field label={t('invoiceTax.amountPaid')}>
              <CurrencyInput className={INPUT} value={amountPaid} onChange={setAmountPaid} />
            </Field>
          )}
        </div>
        {!paid && <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('invoiceTax.amountPaidHint')}</p>}

        {activeAccounts.length > 1 && (
          <Field label={t('movementForm.fields.accountOut')}>
            <select className={INPUT} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}

        <Field label={t('movementForm.fields.notes')}>
          <textarea className={INPUT} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
