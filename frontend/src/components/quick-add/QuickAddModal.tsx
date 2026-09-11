import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { DateInput } from '../ui/DateInput';
import { CategoriesService } from '../../services/categories.service';
import { CashFlowService } from '../../services/cash-flow.service';
import { TransfersService } from '../../services/transfers.service';
import { floatToCents } from '../../utils/money';
import { todayISO } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { useAccount } from '../../contexts/AccountContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';
import { sortByName } from '../../utils/sort';

type QuickAddType = 'payment' | 'extra-expense' | 'income' | 'transfer';

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

interface FormState {
  type: QuickAddType;
  description: string;
  categoryId: string;
  targetAccountId: string;
  amount: string;
  date: string;
}

function initialForm(): FormState {
  return { type: 'payment', description: '', categoryId: '', targetAccountId: '', amount: '', date: todayISO() };
}

export function QuickAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('common');
  const TYPE_LABELS: Record<QuickAddType, string> = {
    payment: t('quickAdd.types.payment'),
    'extra-expense': t('quickAdd.types.extraExpense'),
    income: t('quickAdd.types.income'),
    transfer: t('quickAdd.types.transfer'),
  };
  const [form, setForm] = useState<FormState>(initialForm);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(initialForm()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();
  const qc = useQueryClient();
  const { accountId, accounts } = useAccount();
  const isTransfer = form.type === 'transfer';
  const otherAccounts = sortByName(accounts.filter((a) => a.id !== accountId));

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
    enabled: !isTransfer,
  });

  const categoryType = form.type === 'income' ? 'INCOME' : 'EXPENSE';
  const filteredCategories = sortByName(categories.filter((c) => c.type === categoryType));

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error('Nenhuma conta selecionada.');
      const amount = floatToCents(parseFloat(form.amount) || 0);
      const expectedDate = new Date(form.date).toISOString();

      if (form.type === 'transfer') {
        return TransfersService.create({
          sourceAccountId: accountId,
          targetAccountId: form.targetAccountId,
          amount,
          date: expectedDate,
          description: form.description,
        });
      }
      if (form.type === 'income') {
        return CashFlowService.createIncome(accountId, {
          description: form.description,
          categoryId: form.categoryId,
          amount,
          expectedDate,
        });
      }
      const payload = {
        description: form.description,
        categoryId: form.categoryId,
        amount,
        expectedDate,
      };
      return form.type === 'payment'
        ? CashFlowService.createPayment(accountId, payload)
        : CashFlowService.createExtraExpense(accountId, payload);
    },
    onSuccess: () => { invalidate(); onClose(); },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: t('quickAdd.fields.description'), valid: !!form.description },
      ...(isTransfer
        ? [{ label: t('quickAdd.fields.targetAccount'), valid: !!form.targetAccountId }]
        : [{ label: t('quickAdd.fields.category'), valid: !!form.categoryId }]),
      { label: t('quickAdd.fields.amount'), valid: !!amount },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    mutation.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('quickAdd.title')} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>{t('quickAdd.cancel')}</Button>
        <Button loading={mutation.isPending} onClick={handleSubmit as never}>{t('quickAdd.save')}</Button>
      </>
    }>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden w-full">
          {(Object.keys(TYPE_LABELS) as QuickAddType[]).map((type, i) => (
            <button
              key={type}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type, categoryId: '', targetAccountId: '' }))}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                i > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
              } ${
                form.type === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t('quickAdd.fields.description')} *</label>
          <input
            autoFocus
            className={INPUT}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            {isTransfer ? (
              <>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t('quickAdd.fields.targetAccount')} *</label>
                <select
                  className={INPUT}
                  value={form.targetAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, targetAccountId: e.target.value }))}
                >
                  <option value="">{t('quickAdd.categoryPlaceholder')}</option>
                  {otherAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t('quickAdd.fields.category')} *</label>
                <select
                  className={INPUT}
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">{t('quickAdd.categoryPlaceholder')}</option>
                  {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t('quickAdd.fields.date')} *</label>
            <DateInput className={INPUT} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{t('quickAdd.fields.amount')} *</label>
          <CurrencyInput className={INPUT} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} />
        </div>
      </form>
    </Modal>
  );
}
