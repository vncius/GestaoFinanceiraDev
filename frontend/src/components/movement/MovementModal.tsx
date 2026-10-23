import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, CheckCircle2, ChevronDown, ChevronUp, Lock, Trash2 } from 'lucide-react';
import { Account, Category, CreditCard, FinancialTransaction, RecurrenceType } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CurrencyInput } from '../ui/CurrencyInput';
import { DateInput } from '../ui/DateInput';
import { CategorySelect } from '../ui/CategorySelect';
import { CreateIncomePayload, CreateTransactionPayload } from '../../services/cash-flow.service';
import { CreateCardEntryPayload } from '../../services/credit-cards.service';
import { floatToCents, centsToFloat, formatCurrency } from '../../utils/money';
import { toInputDate, defaultEntryDateISO, monthYearFromDate, formatMonthYearShort } from '../../utils/date';
import i18n from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';
import { sortByName } from '../../utils/sort';
import { competenceOfIssueDate } from '../../utils/invoice-tax';

// Formulário único de lançamento (U12 do plano de UX): Entrada ou Saída com
// os campos essenciais à vista; repetição, "fora do comum", conta e
// observações em "Mais opções". Os tipos do backend continuam os mesmos (D6):
// saída comum = PAYMENT, saída fora do comum = EXTRA_EXPENSE, entrada = INCOME.

export type MovementFormKind = 'income' | 'payment' | 'extra';

export type MovementSubmit =
  | { kind: 'income'; payload: CreateIncomePayload; settleNow: boolean }
  | { kind: 'payment' | 'extra'; payload: CreateTransactionPayload; settleNow: boolean }
  // Compra no cartão pelo mesmo formulário (U18): vira lançamento do cartão.
  | { kind: 'card'; cardId: string; payload: CreateCardEntryPayload };

const PAY_WITH_ACCOUNT = 'account';
const INTL_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

interface FormState {
  direction: 'in' | 'out';
  extra: boolean;
  description: string;
  amount: string;
  date: string;
  categoryId: string;
  settleNow: boolean;
  recurrence: RecurrenceType;
  accountId: string;
  notes: string;
  // 'account' ou id do cartão
  payWith: string;
  installments: string;
  // Nota fiscal (só entradas). null = acompanha o padrão da conta / a data de recebimento.
  invoice: boolean | null;
  taxRate: string | null; // em %
  issueDate: string | null;
}

export function MovementModal({
  open,
  onClose,
  item,
  initialKind = 'payment',
  categories,
  accounts,
  defaultAccountId,
  month,
  year,
  saving,
  onSubmit,
  onSettle,
  onDelete,
  onTransfer,
  accountProminent = false,
  cards = [],
}: {
  open: boolean;
  onClose: () => void;
  // Edição: o tipo vem do lançamento e não pode mudar (trocar exigiria
  // excluir e criar de novo no backend).
  item?: { kind: MovementFormKind; tx: FinancialTransaction };
  initialKind?: MovementFormKind;
  categories: Category[];
  accounts: Account[];
  defaultAccountId: string | null;
  month: number;
  year: number;
  saving: boolean;
  onSubmit: (data: MovementSubmit) => void;
  onSettle?: (kind: MovementFormKind, tx: FinancialTransaction) => void;
  onDelete?: (kind: MovementFormKind, tx: FinancialTransaction) => void;
  // Criação com mais de uma conta: atalho para transferência entre contas.
  onTransfer?: () => void;
  // Visão "Todas as contas": a conta não tem um padrão óbvio, então o campo
  // sai de "Mais opções" e fica à vista (U17).
  accountProminent?: boolean;
  // Cartões ativos: habilitam "Pagar com" numa saída nova (U18).
  cards?: CreditCard[];
}) {
  const { t } = useTranslation('cashFlow');
  const { alert } = useDialog();
  const isEdit = !!item;
  const activeAccounts = sortByName(accounts.filter((a) => a.active));

  const categoriesFor = (direction: 'in' | 'out') =>
    sortByName(categories.filter((c) => c.type === (direction === 'in' ? 'INCOME' : 'EXPENSE')));

  const init = (): FormState => {
    const kind = item?.kind ?? initialKind;
    const direction = kind === 'income' ? 'in' : 'out';
    const tx = item?.tx;
    return {
      direction,
      extra: kind === 'extra',
      description: tx?.description ?? '',
      amount: tx ? String(centsToFloat(tx.amount)) : '',
      date: tx ? toInputDate(tx.expectedDate) : defaultEntryDateISO(month, year),
      categoryId: tx?.categoryId ?? categoriesFor(direction)[0]?.id ?? '',
      settleNow: false,
      recurrence: tx?.recurrence ?? 'UNIQUE',
      accountId: (direction === 'in' ? tx?.targetAccountId : tx?.sourceAccountId) ?? defaultAccountId ?? activeAccounts[0]?.id ?? '',
      notes: tx?.notes ?? '',
      payWith: PAY_WITH_ACCOUNT,
      installments: '1',
      invoice: tx ? tx.taxRateBps != null : null,
      taxRate: tx?.taxRateBps != null ? String(tx.taxRateBps / 100) : null,
      issueDate: tx?.taxRateBps != null && tx.issueDate ? toInputDate(tx.issueDate) : null,
    };
  };

  const [form, setForm] = useState<FormState>(init);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    const next = init();
    setForm(next);
    // Edição com algo fora do padrão já abre "Mais opções", para não esconder
    // o que o lançamento tem.
    setMoreOpen(
      isEdit &&
        (next.recurrence === 'FIXED' || next.extra || !!next.notes || next.accountId !== (defaultAccountId ?? next.accountId)),
    );
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  // Nota fiscal: a conta escolhida define o padrão (marcada, alíquota); depois de
  // editados, os campos param de acompanhá-la.
  const account = activeAccounts.find((a) => a.id === form.accountId);
  const accountEmitsInvoice = !!account?.invoiceTaxEnabled;
  const invoiceOn = form.direction === 'in' && (form.invoice ?? accountEmitsInvoice);
  const defaultRate = account?.invoiceTaxDefaultRateBps != null ? String(account.invoiceTaxDefaultRateBps / 100) : '';
  const taxRate = form.taxRate ?? defaultRate;
  const issueDate = form.issueDate ?? form.date;
  const rateNum = parseFloat(taxRate);
  const rateValid = taxRate.trim() !== '' && Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100;
  const rateBps = rateValid ? Math.round(rateNum * 100) : 0;
  const amountCents = floatToCents(parseFloat(form.amount) || 0);
  const taxCents = Math.round((amountCents * rateBps) / 10_000);
  const dueDay = account?.invoiceTaxDueDay ?? 20;
  const issueAfterReceipt = invoiceOn && !!issueDate && !!form.date && issueDate > form.date;
  const duePreview = (() => {
    if (!issueDate) return null;
    const { month: m, year: y } = monthYearFromDate(issueDate);
    const next = m === 12 ? { month: 1, year: y + 1 } : { month: m + 1, year: y };
    const day = String(dueDay).padStart(2, '0');
    return {
      month: formatMonthYearShort(next.month, next.year, INTL_LOCALE[i18n.language] ?? 'pt-BR'),
      date: `${day}/${String(next.month).padStart(2, '0')}/${next.year}`,
    };
  })();

  const kind: MovementFormKind = form.direction === 'in' ? 'income' : form.extra ? 'extra' : 'payment';
  const activeCards = sortByName(cards.filter((c) => c.active));
  const canPayWithCard = !isEdit && form.direction === 'out' && activeCards.length > 0;
  const payingWithCard = canPayWithCard && form.payWith !== PAY_WITH_ACCOUNT;

  function setDirection(direction: 'in' | 'out') {
    if (isEdit || direction === form.direction) return;
    setForm((f) => ({
      ...f,
      direction,
      extra: direction === 'in' ? false : f.extra,
      categoryId: categoriesFor(direction)[0]?.id ?? '',
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: t('movementForm.validation.description'), valid: !!form.description.trim() },
      { label: t('movementForm.validation.category'), valid: !!form.categoryId },
      { label: t('movementForm.validation.amount'), valid: !!amount },
      ...(invoiceOn
        ? [
            { label: t('movementForm.validation.taxRate'), valid: rateValid },
            { label: t('movementForm.validation.issueDate'), valid: !!issueDate },
          ]
        : []),
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }

    if (payingWithCard) {
      const count = Math.max(1, parseInt(form.installments) || 1);
      onSubmit({
        kind: 'card',
        cardId: form.payWith,
        payload: {
          description: form.description.trim(),
          expenseCategoryId: form.categoryId,
          totalAmount: amount,
          purchaseDate: new Date(form.date).toISOString(),
          entryType: form.recurrence === 'FIXED' ? 'FIXED' : count > 1 ? 'INSTALLMENT' : 'CASH',
          ...(form.recurrence !== 'FIXED' && count > 1 ? { installmentsCount: count } : {}),
          notes: form.notes || null,
        },
      });
      return;
    }

    const base = {
      description: form.description.trim(),
      categoryId: form.categoryId,
      amount,
      expectedDate: new Date(form.date).toISOString(),
      notes: form.notes || null,
      recurrence: form.recurrence,
    };
    const accountId = form.accountId || null;
    if (kind === 'income') {
      // Só manda os campos de NF quando é NF ou quando a entrada editada era NF (para limpar).
      const hadInvoice = item?.tx.taxRateBps != null;
      const invoiceFields = invoiceOn
        ? { taxRateBps: rateBps, issueDate: new Date(issueDate).toISOString() }
        : hadInvoice
        ? { taxRateBps: null, issueDate: null }
        : {};
      onSubmit({ kind, payload: { ...base, targetAccountId: accountId, ...invoiceFields }, settleNow: form.settleNow });
    } else {
      onSubmit({ kind, payload: { ...base, sourceAccountId: accountId }, settleNow: form.settleNow });
    }
  }

  const title = !isEdit
    ? t('movementForm.title.new')
    : kind === 'income'
    ? t('movementForm.title.editIncome')
    : kind === 'extra'
    ? t('movementForm.title.editExtra')
    : t('movementForm.title.editExpense');

  const canSettle = isEdit && item!.tx.status === 'PENDING' && !!onSettle;
  // NF com o imposto do mês já pago (decisão 4): só descrição, categoria e
  // observações mudam até desmarcar o pagamento do imposto.
  const invoiceLocked = isEdit && item!.kind === 'income' && !!item!.tx.invoiceTaxPaid;
  const lockedMonth = invoiceLocked && item!.tx.issueDate ? competenceOfIssueDate(item!.tx.issueDate) : '';
  const lockable = (node: React.ReactNode) =>
    invoiceLocked ? <fieldset disabled className="min-w-0 border-0 p-0 m-0 space-y-4 opacity-60">{node}</fieldset> : node;
  const canDelete = !invoiceLocked && isEdit && (item!.tx.status === 'PENDING' || item!.tx.status === 'PAID' || item!.tx.status === 'RECEIVED') && !!onDelete;
  const isIn = form.direction === 'in';

  const accountField = (
    <Field label={isIn ? t('movementForm.fields.accountIn') : t('movementForm.fields.accountOut')}>
      <select className={INPUT} value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
        {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </Field>
  );

  const invoiceToggle = (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
      <input
        type="checkbox"
        className="rounded"
        checked={invoiceOn}
        onChange={(e) => setForm((f) => ({ ...f, invoice: e.target.checked }))}
      />
      {t('movementForm.fields.invoice')}
    </label>
  );

  const directionButton =(direction: 'in' | 'out') => {
    const active = form.direction === direction;
    const tone = direction === 'in'
      ? 'bg-green-600 text-white'
      : 'bg-red-600 text-white';
    return (
      <button
        type="button"
        onClick={() => setDirection(direction)}
        disabled={isEdit && !active}
        aria-pressed={active}
        className={`flex-1 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          active ? tone : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40'
        }`}
      >
        {t(`movementForm.direction.${direction}`)}
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {canDelete && (
            <button
              type="button"
              title={t('movementForm.delete')}
              aria-label={t('movementForm.delete')}
              onClick={() => { onClose(); onDelete!(item!.kind, item!.tx); }}
              className="mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('movementForm.cancel')}</Button>
          {canSettle && (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              onClick={() => { onSettle!(item!.kind, item!.tx); onClose(); }}
            >
              {isIn ? t('movementForm.markReceived') : t('movementForm.markPaid')}
            </Button>
          )}
          <Button loading={saving} onClick={handleSubmit as never}>{t('movementForm.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden" role="group" aria-label={t('movementForm.directionLabel')}>
            {directionButton('out')}
            {directionButton('in')}
          </div>
          {isEdit && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('movementForm.lockedInEdit')}</p>}
        </div>

        <Field label={t('movementForm.fields.description')}>
          <input
            className={INPUT}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={isIn ? t('movementForm.placeholders.in') : t('movementForm.placeholders.out')}
            autoFocus={!isEdit}
          />
        </Field>

        {invoiceLocked && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
            {t('invoiceTax.invoiceLocked', { month: lockedMonth })}
          </p>
        )}

        {lockable(<div className="grid grid-cols-2 gap-3">
          <Field label={t('movementForm.fields.amount')}>
            <CurrencyInput className={INPUT} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} />
          </Field>
          {invoiceOn ? (
            <Field label={t('movementForm.fields.taxRate')}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                className={INPUT}
                value={taxRate}
                onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                placeholder="6"
              />
            </Field>
          ) : (
            <Field label={t('movementForm.fields.date')}>
              <DateInput className={INPUT} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            </Field>
          )}
        </div>)}

        {invoiceOn && lockable(
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('movementForm.fields.issueDate')}>
                <DateInput className={INPUT} value={issueDate} onChange={(v) => setForm((f) => ({ ...f, issueDate: v }))} />
              </Field>
              <Field label={t('movementForm.fields.receiveDate')}>
                <DateInput className={INPUT} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              </Field>
            </div>
            {issueAfterReceipt && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('movementForm.invoice.issueAfterReceipt')}</p>
            )}
            {rateValid && amountCents > 0 && duePreview && (
              <p className="text-xs text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                {t('movementForm.invoice.preview', { tax: formatCurrency(taxCents), month: duePreview.month, due: duePreview.date })}
              </p>
            )}
          </>
        )}

        <Field label={t('movementForm.fields.category')}>
          <CategorySelect
            className={INPUT}
            value={form.categoryId}
            onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
            type={isIn ? 'INCOME' : 'EXPENSE'}
            categories={categories}
            placeholder={t('movementForm.fields.selectPlaceholder')}
          />
        </Field>

        {canPayWithCard && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('movementForm.fields.payWith')}>
              <select className={INPUT} value={form.payWith} onChange={(e) => setForm((f) => ({ ...f, payWith: e.target.value, settleNow: false, extra: false }))}>
                <option value={PAY_WITH_ACCOUNT}>{t('movementForm.fields.payWithAccount')}</option>
                {activeCards.map((c) => <option key={c.id} value={c.id}>{t('movementForm.fields.payWithCard', { card: c.name })}</option>)}
              </select>
            </Field>
            {payingWithCard && form.recurrence !== 'FIXED' && (
              <Field label={t('movementForm.fields.installments')}>
                <select className={INPUT} value={form.installments} onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}>
                  {Array.from({ length: 24 }, (_, i) => String(i + 1)).map((n) => (
                    <option key={n} value={n}>{n === '1' ? t('movementForm.fields.cash') : t('movementForm.fields.installmentsN', { count: Number(n) })}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
        {payingWithCard && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('movementForm.cardHint')}</p>
        )}

        {activeAccounts.length > 1 && accountProminent && !payingWithCard && lockable(accountField)}

        {!isEdit && !payingWithCard && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.settleNow}
              onChange={(e) => setForm((f) => ({ ...f, settleNow: e.target.checked }))}
            />
            {isIn ? t('movementForm.fields.settledIn') : t('movementForm.fields.settledOut')}
          </label>
        )}

        {isIn && accountEmitsInvoice && lockable(invoiceToggle)}

        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {moreOpen ? t('movementForm.lessOptions') : t('movementForm.moreOptions')}
          {moreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {moreOpen && (
          <div className="space-y-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
            {isEdit && item!.tx.recurrence === 'FIXED' ? (
              <p className="text-xs text-gray-600 dark:text-gray-300">{t('movementForm.fixedLocked')}</p>
            ) : lockable(
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={form.recurrence === 'FIXED'}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.checked ? 'FIXED' : 'UNIQUE' }))}
                />
                {t('movementForm.fields.fixed')}
              </label>
            )}

            {!isIn && !payingWithCard && (
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={form.extra}
                    disabled={isEdit}
                    onChange={(e) => setForm((f) => ({ ...f, extra: e.target.checked }))}
                  />
                  {t('movementForm.fields.extra')}
                </label>
                <p className="ml-6 text-xs text-gray-500 dark:text-gray-400">{t('movementForm.fields.extraHint')}</p>
              </div>
            )}

            {isIn && !accountEmitsInvoice && lockable(invoiceToggle)}

            {activeAccounts.length > 1 && !accountProminent && !payingWithCard && lockable(accountField)}

            <Field label={t('movementForm.fields.notes')}>
              <textarea className={INPUT} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
        )}

        {!isEdit && onTransfer && activeAccounts.length > 1 && (
          <button
            type="button"
            onClick={onTransfer}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <ArrowLeftRight size={13} /> {t('movementForm.transferLink')}
          </button>
        )}
      </form>
    </Modal>
  );
}
