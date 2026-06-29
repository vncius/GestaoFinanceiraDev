import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  RotateCcw,
  Plus,
  Trash2,
  ChevronRight,
  CreditCard as CreditCardIcon,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import {
  CreditCardsService,
  CreateCardEntryPayload,
} from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { Category, CreditCard } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { invoiceStatusBadge } from '../../components/ui/Badge';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';
import { formatDate, formatMonthYear, todayISO } from '../../utils/date';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

// ── Entry Modal ───────────────────────────────────────────────────────────────

interface EntryFormState {
  description: string;
  expenseCategoryId: string;
  totalAmount: string;
  purchaseDate: string;
  entryType: 'CASH' | 'FIXED' | 'INSTALLMENT';
  installmentsCount: string;
  notes: string;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  CASH: 'À vista',
  FIXED: 'Recorrente (12x)',
  INSTALLMENT: 'Parcelado',
};

function EntryModal({
  open,
  onClose,
  categories,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onSave: (data: CreateCardEntryPayload) => void;
  isSaving: boolean;
}) {
  const expenseCats = categories.filter((c) => c.type === 'EXPENSE' && c.active);

  const init = (): EntryFormState => ({
    description: '',
    expenseCategoryId: expenseCats[0]?.id ?? '',
    totalAmount: '',
    purchaseDate: todayISO(),
    entryType: 'CASH',
    installmentsCount: '2',
    notes: '',
  });

  const [form, setForm] = useState<EntryFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const set =
    (k: keyof EntryFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = floatToCents(parseFloat(form.totalAmount) || 0);
    if (!cents || !form.description || !form.expenseCategoryId) return;
    onSave({
      description: form.description,
      expenseCategoryId: form.expenseCategoryId,
      totalAmount: cents,
      purchaseDate: new Date(form.purchaseDate).toISOString(),
      entryType: form.entryType,
      installmentsCount:
        form.entryType === 'INSTALLMENT' ? parseInt(form.installmentsCount) : undefined,
      notes: form.notes || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar Lançamento"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>Adicionar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Descrição *">
          <input className={INPUT} value={form.description} onChange={set('description')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria *">
            <select className={INPUT} value={form.expenseCategoryId} onChange={set('expenseCategoryId')} required>
              <option value="">Selecione...</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Data da compra *">
            <input type="date" className={INPUT} value={form.purchaseDate} onChange={set('purchaseDate')} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor total (R$) *">
            <input type="number" step="0.01" min="0.01" className={INPUT} value={form.totalAmount} onChange={set('totalAmount')} required />
          </Field>
          <Field label="Tipo *">
            <select
              className={INPUT}
              value={form.entryType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  entryType: e.target.value as EntryFormState['entryType'],
                }))
              }
            >
              {Object.entries(ENTRY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.entryType === 'INSTALLMENT' && (
          <Field label="Nº de parcelas *">
            <input
              type="number"
              min="2"
              max="60"
              className={INPUT}
              value={form.installmentsCount}
              onChange={set('installmentsCount')}
              required
            />
          </Field>
        )}
        <Field label="Observações">
          <input className={INPUT} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Card Detail ───────────────────────────────────────────────────────────────

function CardDetail({
  card,
  month,
  year,
}: {
  card: CreditCard;
  month: number;
  year: number;
}) {
  const qc = useQueryClient();
  const [showEntryModal, setShowEntryModal] = useState(false);

  const flowKey = ['creditCards', 'flow', card.id, month, year] as const;

  const { data: flow, isLoading } = useQuery({
    queryKey: flowKey,
    queryFn: () => CreditCardsService.getFlow(card.id, month, year),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: flowKey });
    qc.invalidateQueries({ queryKey: ['creditCards'] });
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
  };

  const addEntryMut = useMutation({
    mutationFn: (payload: CreateCardEntryPayload) =>
      CreditCardsService.createEntry(card.id, payload),
    onSuccess: () => { invalidate(); setShowEntryModal(false); },
  });
  const deleteEntryMut = useMutation({
    mutationFn: (entryId: string) => CreditCardsService.deleteEntry(card.id, entryId),
    onSuccess: invalidate,
  });
  const payMut = useMutation({
    mutationFn: (invoiceId: string) => CreditCardsService.payInvoice(card.id, invoiceId),
    onSuccess: invalidate,
  });
  const revertMut = useMutation({
    mutationFn: (invoiceId: string) => CreditCardsService.revertInvoice(card.id, invoiceId),
    onSuccess: invalidate,
  });

  if (isLoading) return <PageLoading />;
  if (!flow) return null;

  const { invoice, installments, entries, summary } = flow;
  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const activeInstallments = installments.filter((i) => i.status !== 'CANCELED');

  return (
    <div className="space-y-4">
      {/* Invoice header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Fatura — {formatMonthYear(month, year)}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {card.name} · {card.bank}
            </p>
            {invoice?.dueDate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Vencimento: {formatDate(invoice.dueDate)}
              </p>
            )}
          </div>
          <div>
            {invoice
              ? invoiceStatusBadge(invoice.status)
              : <span className="text-xs text-gray-400">Sem fatura</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Total fatura</p>
            <p className="text-lg font-bold text-gray-800">{formatCurrency(summary.invoiceTotal)}</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Pago</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(summary.paidAmount)}</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Em aberto</p>
            <p className="text-lg font-bold text-red-500">{formatCurrency(summary.openAmount)}</p>
          </div>
        </div>

        {invoice && (
          <div className="flex gap-2">
            {(invoice.status === 'OPEN' || invoice.status === 'OVERDUE') && (
              <Button
                size="sm"
                icon={<CheckCircle2 size={14} />}
                onClick={() => payMut.mutate(invoice.id)}
                loading={payMut.isPending}
              >
                Pagar fatura
              </Button>
            )}
            {invoice.status === 'PAID' && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={14} />}
                onClick={() => revertMut.mutate(invoice.id)}
                loading={revertMut.isPending}
              >
                Reverter pagamento
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Installments table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Lançamentos ({activeInstallments.length})
          </h3>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            onClick={() => setShowEntryModal(true)}
          >
            Adicionar
          </Button>
        </div>

        {activeInstallments.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento neste mês"
            description="Clique em Adicionar para registrar uma compra"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5 font-medium">Descrição</th>
                  <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                  <th className="text-left px-3 py-2.5 font-medium">Data compra</th>
                  <th className="text-left px-3 py-2.5 font-medium">Parcela</th>
                  <th className="text-right px-3 py-2.5 font-medium">Valor</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeInstallments.map((inst) => {
                  const entry = entryMap.get(inst.creditCardEntryId);
                  return (
                    <tr key={inst.id} className="hover:bg-gray-50/50 group">
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {entry?.description ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {entry ? (catMap.get(entry.expenseCategoryId) ?? '—') : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {entry ? formatDate(entry.purchaseDate) : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {entry?.entryType === 'CASH'
                          ? 'À vista'
                          : entry?.entryType === 'FIXED'
                          ? 'Recorrente'
                          : `${inst.installmentNumber}/${inst.totalInstallments}`}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-800">
                        {formatCurrency(inst.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {entry?.active && (
                            <button
                              title="Cancelar lançamento"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancelar este lançamento e todas as suas parcelas?'
                                  )
                                )
                                  deleteEntryMut.mutate(entry.id);
                              }}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EntryModal
        open={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        categories={categories}
        onSave={(payload) => addEntryMut.mutate(payload)}
        isSaving={addEntryMut.isPending}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditCards() {
  const { month, year } = useMonth();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['creditCards'],
    queryFn: CreditCardsService.findAll,
  });

  const activeCards = cards.filter((c) => c.active);
  const selectedCard = activeCards.find((c) => c.id === selectedCardId) ?? null;

  if (isLoading) return <PageLoading />;

  if (activeCards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <EmptyState
          title="Nenhum cartão cadastrado"
          description="Cadastre cartões de crédito em Parametrizações → Cartões"
          icon={<CreditCardIcon size={24} className="text-gray-300" />}
        />
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-full min-h-0">
      {/* Card list */}
      <div className="w-60 shrink-0 space-y-2 overflow-y-auto">
        {activeCards.map((card) => (
          <button
            key={card.id}
            onClick={() => setSelectedCardId(card.id)}
            className={`w-full text-left p-4 rounded-xl border transition-all ${
              selectedCardId === card.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{card.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.bank}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0 mt-1" />
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Mês atual</span>
                <span className="font-semibold text-red-500">
                  {formatCurrency(card.currentMonthAmount)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Limite</span>
                <span className="text-gray-600">{formatCurrency(card.limit)}</span>
              </div>
              {card.currentInvoice && (
                <div className="pt-1">{invoiceStatusBadge(card.currentInvoice.status)}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Card detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedCard ? (
          <CardDetail card={selectedCard} month={month} year={year} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title="Selecione um cartão"
              description="Clique em um cartão à esquerda para ver os detalhes"
              icon={<CreditCardIcon size={24} className="text-gray-300" />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
