import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  RotateCcw,
  Pencil,
  Trash2,
  Plus,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { CashFlowService, CreateTransactionPayload } from '../../services/cash-flow.service';
import { ReceivablesService, CreateReceivablePayload } from '../../services/receivables.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import {
  CashFlowSummary,
  Category,
  CreditCardInvoice,
  FinancialTransaction,
  Receivable,
} from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge, receivableStatusBadge, transactionStatusBadge, invoiceStatusBadge } from '../../components/ui/Badge';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, floatToCents, centsToFloat } from '../../utils/money';
import { formatDate, toInputDate, todayISO } from '../../utils/date';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalKind =
  | { type: 'receivable'; mode: 'create' | 'edit'; item?: Receivable }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction };

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary: s }: { summary: CashFlowSummary }) {
  const items = [
    { label: 'Saldo inicial', value: s.initialBalance, neutral: true },
    { label: 'Entradas prev.', value: s.expectedIncome, positive: true },
    { label: 'Entradas receb.', value: s.receivedIncome, positive: true },
    { label: 'Pagamentos prev.', value: s.expectedPayments },
    { label: 'Pagamentos pagos', value: s.paidPayments },
    { label: 'Extras prev.', value: s.expectedExtraExpenses },
    { label: 'Extras pagos', value: s.paidExtraExpenses },
    { label: 'Faturas cartão', value: s.creditCardInvoices },
    { label: 'Projetado', value: s.projectedBalance, bold: true },
    { label: 'Realizado', value: s.realizedBalance, bold: true },
  ];

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-md z-10">
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
        {items.map(({ label, value, neutral, positive, bold }) => {
          const color = neutral
            ? 'text-gray-700'
            : positive
            ? 'text-green-600'
            : value < 0
            ? 'text-red-600'
            : 'text-red-500';
          return (
            <div
              key={label}
              className="flex flex-col items-center shrink-0 px-3 border-r border-gray-100 last:border-r-0 min-w-[90px]"
            >
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{label}</span>
              <span className={`text-xs font-${bold ? 'bold' : 'semibold'} whitespace-nowrap ${color}`}>
                {formatCurrency(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Grid Table ────────────────────────────────────────────────────────────────

function GridHeader({
  title,
  icon,
  count,
  onAdd,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={onAdd}>
        Novo
      </Button>
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  className = '',
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// ── Entries (Receivables) ─────────────────────────────────────────────────────

function EntriesGrid({
  items,
  categories,
  onAdd,
  onEdit,
  onReceive,
  onRevert,
  onDelete,
}: {
  items: Receivable[];
  categories: Category[];
  onAdd: () => void;
  onEdit: (item: Receivable) => void;
  onReceive: (id: string) => void;
  onRevert: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <GridHeader
        title="Entradas"
        icon={<TrendingUp size={16} className="text-green-500" />}
        count={items.length}
        onAdd={onAdd}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma entrada neste mês"
          description="Clique em Novo para adicionar um recebimento"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-2.5 font-medium">Descrição</th>
                <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="text-right px-3 py-2.5 font-medium">Valor líquido</th>
                <th className="text-left px-3 py-2.5 font-medium">Data prev.</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 group">
                  <td
                    className="px-5 py-3 font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                    onClick={() => onEdit(item)}
                  >
                    {item.description}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {catMap.get(item.incomeCategoryId) ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-green-700">
                    {formatCurrency(item.netAmount)}
                  </td>
                  <td className="px-3 py-3 text-gray-500">
                    {formatDate(item.expectedPaymentDate)}
                  </td>
                  <td className="px-3 py-3">{receivableStatusBadge(item.status)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.status === 'EXPECTED' && (
                        <ActionBtn
                          title="Marcar como recebido"
                          onClick={() => onReceive(item.id)}
                          className="text-green-600 hover:bg-green-50"
                        >
                          <CheckCircle2 size={16} />
                        </ActionBtn>
                      )}
                      {item.status === 'RECEIVED' && (
                        <ActionBtn
                          title="Reverter recebimento"
                          onClick={() => onRevert(item.id)}
                          className="text-amber-600 hover:bg-amber-50"
                        >
                          <RotateCcw size={15} />
                        </ActionBtn>
                      )}
                      <ActionBtn
                        title="Editar"
                        onClick={() => onEdit(item)}
                        className="text-gray-500 hover:bg-gray-100"
                      >
                        <Pencil size={14} />
                      </ActionBtn>
                      {item.status === 'EXPECTED' && (
                        <ActionBtn
                          title="Excluir"
                          onClick={() => onDelete(item.id)}
                          className="text-red-400 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Transaction Grid (Payments / Extra Expenses) ──────────────────────────────

function TransactionGrid({
  title,
  icon,
  items,
  categories,
  onAdd,
  onEdit,
  onPay,
  onRevert,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  items: FinancialTransaction[];
  categories: Category[];
  onAdd: () => void;
  onEdit: (item: FinancialTransaction) => void;
  onPay: (id: string) => void;
  onRevert: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <GridHeader title={title} icon={icon} count={items.length} onAdd={onAdd} />

      {items.length === 0 ? (
        <EmptyState title={`Nenhum registro neste mês`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-2.5 font-medium">Descrição</th>
                <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="text-right px-3 py-2.5 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 font-medium">Data prev.</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 group">
                  <td
                    className="px-5 py-3 font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                    onClick={() => onEdit(item)}
                  >
                    {item.description}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {catMap.get(item.categoryId ?? '') ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-red-600">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="px-3 py-3 text-gray-500">
                    {formatDate(item.expectedDate)}
                  </td>
                  <td className="px-3 py-3">{transactionStatusBadge(item.status)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.status === 'PENDING' && (
                        <ActionBtn
                          title="Marcar como pago"
                          onClick={() => onPay(item.id)}
                          className="text-green-600 hover:bg-green-50"
                        >
                          <CheckCircle2 size={16} />
                        </ActionBtn>
                      )}
                      {item.status === 'PAID' && (
                        <ActionBtn
                          title="Reverter pagamento"
                          onClick={() => onRevert(item.id)}
                          className="text-amber-600 hover:bg-amber-50"
                        >
                          <RotateCcw size={15} />
                        </ActionBtn>
                      )}
                      {item.status !== 'CANCELED' && item.status !== 'REVERSED' && (
                        <ActionBtn
                          title="Editar"
                          onClick={() => onEdit(item)}
                          className="text-gray-500 hover:bg-gray-100"
                        >
                          <Pencil size={14} />
                        </ActionBtn>
                      )}
                      {item.status === 'PENDING' && (
                        <ActionBtn
                          title="Excluir"
                          onClick={() => onDelete(item.id)}
                          className="text-red-400 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Credit Cards Grid ─────────────────────────────────────────────────────────

function CreditCardsGrid({
  items,
  cardNames,
  onPay,
  onRevert,
}: {
  items: CreditCardInvoice[];
  cardNames: Map<string, string>;
  onPay: (invoice: CreditCardInvoice) => void;
  onRevert: (invoice: CreditCardInvoice) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        <CreditCard size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-700">Cartões de Crédito</h3>
        <span className="text-xs text-gray-400">({items.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 font-medium">Cartão</th>
              <th className="text-right px-3 py-2.5 font-medium">Valor fatura</th>
              <th className="text-left px-3 py-2.5 font-medium">Vencimento</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50/50 group">
                <td className="px-5 py-3 font-medium text-gray-800">
                  {cardNames.get(inv.creditCardId) ?? 'Cartão'}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-purple-700">
                  {formatCurrency(inv.totalAmount)}
                </td>
                <td className="px-3 py-3 text-gray-500">{formatDate(inv.dueDate)}</td>
                <td className="px-3 py-3">{invoiceStatusBadge(inv.status)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(inv.status === 'OPEN' || inv.status === 'OVERDUE') && (
                      <ActionBtn
                        title="Pagar fatura"
                        onClick={() => onPay(inv)}
                        className="text-green-600 hover:bg-green-50"
                      >
                        <CheckCircle2 size={16} />
                      </ActionBtn>
                    )}
                    {inv.status === 'PAID' && (
                      <ActionBtn
                        title="Reverter pagamento"
                        onClick={() => onRevert(inv)}
                        className="text-amber-600 hover:bg-amber-50"
                      >
                        <RotateCcw size={15} />
                      </ActionBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Receivable Modal ──────────────────────────────────────────────────────────

interface ReceivableFormState {
  description: string;
  expectedPaymentDate: string;
  grossAmount: string;
  separateReservePercentage: boolean;
  incomeCategoryId: string;
  notes: string;
}

function ReceivableModal({
  open,
  onClose,
  item,
  categories,
  defaultReservePct,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: Receivable;
  categories: Category[];
  defaultReservePct: number;
  onSave: (data: CreateReceivablePayload) => void;
  isSaving: boolean;
}) {
  const isEdit = !!item;
  const incomeCategories = categories.filter((c) => c.type === 'INCOME');

  const init = (): ReceivableFormState => ({
    description: item?.description ?? '',
    expectedPaymentDate: item ? toInputDate(item.expectedPaymentDate) : todayISO(),
    grossAmount: item ? String(centsToFloat(item.grossAmount)) : '',
    separateReservePercentage: item?.separateReservePercentage ?? true,
    incomeCategoryId: item?.incomeCategoryId ?? (incomeCategories[0]?.id ?? ''),
    notes: item?.notes ?? '',
  });

  const [form, setForm] = useState<ReceivableFormState>(init);

  // reset when opening
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const grossCents = floatToCents(parseFloat(form.grossAmount) || 0);
  const pct = form.separateReservePercentage ? defaultReservePct : 0;
  const reserveCents = Math.round((grossCents * pct) / 100);
  const netCents = grossCents - reserveCents;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grossCents || !form.description || !form.incomeCategoryId) return;
    onSave({
      description: form.description,
      expectedPaymentDate: new Date(form.expectedPaymentDate).toISOString(),
      grossAmount: grossCents,
      separateReservePercentage: form.separateReservePercentage,
      incomeCategoryId: form.incomeCategoryId,
      notes: form.notes || null,
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
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
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
            <input type="date" className={INPUT} value={form.expectedPaymentDate} onChange={set('expectedPaymentDate')} required />
          </Field>
        </div>
        <Field label="Valor bruto (R$) *">
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={INPUT}
            value={form.grossAmount}
            onChange={set('grossAmount')}
            required
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.separateReservePercentage}
            onChange={(e) => setForm((f) => ({ ...f, separateReservePercentage: e.target.checked }))}
            className="rounded"
          />
          Separar reserva ({defaultReservePct}%)
        </label>
        {grossCents > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <div className="flex justify-between"><span>Reserva ({pct}%)</span><span className="font-medium">{formatCurrency(reserveCents)}</span></div>
            <div className="flex justify-between font-semibold text-gray-800"><span>Valor líquido</span><span className="text-green-700">{formatCurrency(netCents)}</span></div>
          </div>
        )}
        <Field label="Observações">
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Transaction Modal (Payment / Extra Expense) ───────────────────────────────

interface TxFormState {
  description: string;
  categoryId: string;
  amount: string;
  expectedDate: string;
  notes: string;
}

function TransactionModal({
  open,
  onClose,
  type,
  item,
  categories,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  type: 'payment' | 'extra-expense';
  item?: FinancialTransaction;
  categories: Category[];
  onSave: (data: CreateTransactionPayload) => void;
  isSaving: boolean;
}) {
  const isEdit = !!item;
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const title = type === 'payment'
    ? (isEdit ? 'Editar Pagamento' : 'Novo Pagamento')
    : (isEdit ? 'Editar Gasto Extraordinário' : 'Novo Gasto Extraordinário');

  const init = (): TxFormState => ({
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? (expenseCategories[0]?.id ?? ''),
    amount: item ? String(centsToFloat(item.amount)) : '',
    expectedDate: item ? toInputDate(item.expectedDate) : todayISO(),
    notes: item?.notes ?? '',
  });

  const [form, setForm] = useState<TxFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    if (!amount || !form.description || !form.categoryId) return;
    onSave({
      description: form.description,
      categoryId: form.categoryId,
      amount,
      expectedDate: new Date(form.expectedDate).toISOString(),
      notes: form.notes || null,
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
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
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
            <select className={INPUT} value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">Selecione...</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Data prevista *">
            <input type="date" className={INPUT} value={form.expectedDate} onChange={set('expectedDate')} required />
          </Field>
        </div>
        <Field label="Valor (R$) *">
          <input type="number" step="0.01" min="0.01" className={INPUT} value={form.amount} onChange={set('amount')} required />
        </Field>
        <Field label="Observações">
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Shared form helpers ───────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CashFlow() {
  const { month, year } = useMonth();
  const qc = useQueryClient();

  const cfKey = ['cashFlow', month, year] as const;
  const invalidate = () => qc.invalidateQueries({ queryKey: cfKey });

  const { data, isLoading } = useQuery({
    queryKey: cfKey,
    queryFn: () => CashFlowService.get(month, year),
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

  const { data: cards = [] } = useQuery({
    queryKey: ['creditCards'],
    queryFn: CreditCardsService.findAll,
    staleTime: 60_000,
  });

  const cardNames = new Map(cards.map((c) => [c.id, c.name]));

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalKind | null>(null);
  const closeModal = () => setModal(null);

  // ── Receivable mutations ─────────────────────────────────────────────────────
  const createReceivable = useMutation({
    mutationFn: ReceivablesService.create,
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateReceivable = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof ReceivablesService.update>[1] }) =>
      ReceivablesService.update(id, data),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const receiveItem = useMutation({
    mutationFn: (id: string) => ReceivablesService.receive(id),
    onSuccess: invalidate,
  });
  const revertReceivable = useMutation({
    mutationFn: ReceivablesService.revert,
    onSuccess: invalidate,
  });
  const deleteReceivable = useMutation({
    mutationFn: ReceivablesService.remove,
    onSuccess: invalidate,
  });

  // ── Payment mutations ────────────────────────────────────────────────────────
  const createPayment = useMutation({
    mutationFn: CashFlowService.createPayment,
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updatePayment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTransactionPayload> }) =>
      CashFlowService.updatePayment(id, data),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const payPayment = useMutation({
    mutationFn: (id: string) => CashFlowService.payPayment(id),
    onSuccess: invalidate,
  });
  const revertPayment = useMutation({
    mutationFn: CashFlowService.revertPayment,
    onSuccess: invalidate,
  });
  const deletePayment = useMutation({
    mutationFn: CashFlowService.deletePayment,
    onSuccess: invalidate,
  });

  // ── Extra expense mutations ──────────────────────────────────────────────────
  const createExtra = useMutation({
    mutationFn: CashFlowService.createExtraExpense,
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateExtra = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTransactionPayload> }) =>
      CashFlowService.updateExtraExpense(id, data),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const payExtra = useMutation({
    mutationFn: (id: string) => CashFlowService.payExtraExpense(id),
    onSuccess: invalidate,
  });
  const revertExtra = useMutation({
    mutationFn: CashFlowService.revertExtraExpense,
    onSuccess: invalidate,
  });
  const deleteExtra = useMutation({
    mutationFn: CashFlowService.deleteExtraExpense,
    onSuccess: invalidate,
  });

  // ── Invoice mutations ────────────────────────────────────────────────────────
  const payInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId }: { cardId: string; invoiceId: string }) =>
      CreditCardsService.payInvoice(cardId, invoiceId),
    onSuccess: invalidate,
  });
  const revertInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId }: { cardId: string; invoiceId: string }) =>
      CreditCardsService.revertInvoice(cardId, invoiceId),
    onSuccess: invalidate,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function saveReceivable(payload: CreateReceivablePayload) {
    if (modal?.type !== 'receivable') return;
    if (modal.item) {
      updateReceivable.mutate({ id: modal.item.id, data: payload });
    } else {
      createReceivable.mutate(payload);
    }
  }

  function saveTransaction(payload: CreateTransactionPayload) {
    if (modal?.type !== 'payment' && modal?.type !== 'extra-expense') return;
    const isPayment = modal.type === 'payment';
    if (modal.item) {
      if (isPayment) updatePayment.mutate({ id: modal.item.id, data: payload });
      else updateExtra.mutate({ id: modal.item.id, data: payload });
    } else {
      if (isPayment) createPayment.mutate(payload);
      else createExtra.mutate(payload);
    }
  }

  function confirmDelete(fn: () => void) {
    if (window.confirm('Confirmar exclusão?')) fn();
  }

  if (isLoading || !data) return <PageLoading />;

  const { entries, payments, extraExpenses, creditCards, summary } = data;
  const defaultReservePct = settings?.defaultReservePercentage ?? 30;

  const txSaving =
    createPayment.isPending || updatePayment.isPending ||
    createExtra.isPending || updateExtra.isPending;

  const rxSaving = createReceivable.isPending || updateReceivable.isPending;

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 space-y-4 pb-4">
        {/* Entradas */}
        <EntriesGrid
          items={entries}
          categories={categories}
          onAdd={() => setModal({ type: 'receivable', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'receivable', mode: 'edit', item })}
          onReceive={(id) => receiveItem.mutate(id)}
          onRevert={(id) => revertReceivable.mutate(id)}
          onDelete={(id) => confirmDelete(() => deleteReceivable.mutate(id))}
        />

        {/* Pagamentos */}
        <TransactionGrid
          title="Pagamentos"
          icon={<TrendingDown size={16} className="text-red-500" />}
          items={payments}
          categories={categories}
          onAdd={() => setModal({ type: 'payment', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'payment', mode: 'edit', item })}
          onPay={(id) => payPayment.mutate(id)}
          onRevert={(id) => revertPayment.mutate(id)}
          onDelete={(id) => confirmDelete(() => deletePayment.mutate(id))}
        />

        {/* Gastos Extraordinários */}
        <TransactionGrid
          title="Gastos Extraordinários"
          icon={<TrendingDown size={16} className="text-orange-500" />}
          items={extraExpenses}
          categories={categories}
          onAdd={() => setModal({ type: 'extra-expense', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'extra-expense', mode: 'edit', item })}
          onPay={(id) => payExtra.mutate(id)}
          onRevert={(id) => revertExtra.mutate(id)}
          onDelete={(id) => confirmDelete(() => deleteExtra.mutate(id))}
        />

        {/* Cartões de Crédito */}
        <CreditCardsGrid
          items={creditCards}
          cardNames={cardNames}
          onPay={(inv) => payInvoice.mutate({ cardId: inv.creditCardId, invoiceId: inv.id })}
          onRevert={(inv) => revertInvoice.mutate({ cardId: inv.creditCardId, invoiceId: inv.id })}
        />
      </div>

      {/* Summary bar */}
      <SummaryBar summary={summary} />

      {/* Modals */}
      <ReceivableModal
        open={modal?.type === 'receivable'}
        onClose={closeModal}
        item={modal?.type === 'receivable' ? modal.item : undefined}
        categories={categories}
        defaultReservePct={defaultReservePct}
        onSave={saveReceivable}
        isSaving={rxSaving}
      />

      {(modal?.type === 'payment' || modal?.type === 'extra-expense') && (
        <TransactionModal
          open
          onClose={closeModal}
          type={modal.type}
          item={modal.item}
          categories={categories}
          onSave={saveTransaction}
          isSaving={txSaving}
        />
      )}
    </div>
  );
}
