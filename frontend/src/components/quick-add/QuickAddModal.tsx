import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { DateInput } from '../ui/DateInput';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import { CashFlowService } from '../../services/cash-flow.service';
import { ReceivablesService } from '../../services/receivables.service';
import { floatToCents } from '../../utils/money';
import { todayISO } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';

type QuickAddType = 'payment' | 'extra-expense' | 'receivable';

const TYPE_LABELS: Record<QuickAddType, string> = {
  payment: 'Pagamento',
  'extra-expense': 'Gasto Extra',
  receivable: 'Recebimento',
};

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

interface FormState {
  type: QuickAddType;
  description: string;
  categoryId: string;
  amount: string;
  date: string;
}

function initialForm(): FormState {
  return { type: 'payment', description: '', categoryId: '', amount: '', date: todayISO() };
}

export function QuickAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(initialForm()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();
  const qc = useQueryClient();

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

  const categoryType = form.type === 'receivable' ? 'INCOME' : 'EXPENSE';
  const filteredCategories = categories.filter((c) => c.type === categoryType);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['receivables'] });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const amount = floatToCents(parseFloat(form.amount) || 0);
      const expectedDate = new Date(form.date).toISOString();

      if (form.type === 'receivable') {
        return ReceivablesService.create({
          description: form.description,
          expectedPaymentDate: expectedDate,
          grossAmount: amount,
          separateReservePercentage: settings?.applyReserveByDefault ?? true,
          incomeCategoryId: form.categoryId,
        });
      }
      const payload = {
        description: form.description,
        categoryId: form.categoryId,
        amount,
        expectedDate,
      };
      return form.type === 'payment'
        ? CashFlowService.createPayment(payload)
        : CashFlowService.createExtraExpense(payload);
    },
    onSuccess: () => { invalidate(); onClose(); },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: 'Descrição', valid: !!form.description },
      { label: 'Categoria', valid: !!form.categoryId },
      { label: 'Valor', valid: !!amount },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    mutation.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="Lançamento Rápido" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={mutation.isPending} onClick={handleSubmit as never}>Salvar</Button>
      </>
    }>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden w-full">
          {(Object.keys(TYPE_LABELS) as QuickAddType[]).map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t, categoryId: '' }))}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                i > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
              } ${
                form.type === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Descrição *</label>
          <input
            autoFocus
            className={INPUT}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Categoria *</label>
            <select
              className={INPUT}
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Data *</label>
            <DateInput className={INPUT} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Valor *</label>
          <CurrencyInput className={INPUT} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} />
        </div>
      </form>
    </Modal>
  );
}
