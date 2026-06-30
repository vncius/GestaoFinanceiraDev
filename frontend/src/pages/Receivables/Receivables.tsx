import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, Pencil, Trash2, Plus } from 'lucide-react';
import {
  ReceivablesService,
  CreateReceivablePayload,
} from '../../services/receivables.service';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import { Category, Receivable } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { receivableStatusBadge } from '../../components/ui/Badge';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';
import { formatDate, toInputDate, todayISO } from '../../utils/date';
import { CurrencyInput } from '../../components/ui/CurrencyInput';

// ── Types & constants ─────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'EXPECTED' | 'RECEIVED' | 'CANCELED';

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: 'Todos',
  EXPECTED: 'Esperados',
  RECEIVED: 'Recebidos',
  CANCELED: 'Cancelados',
};

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

// ── Receivable Modal ──────────────────────────────────────────────────────────

interface FormState {
  description: string;
  incomeCategoryId: string;
  expectedPaymentDate: string;
  grossAmount: string;
  separateReservePercentage: boolean;
  customerName: string;
  invoiceNumber: string;
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
  const incomeCats = categories.filter((c) => c.type === 'INCOME' && c.active);

  const init = (): FormState => ({
    description: item?.description ?? '',
    incomeCategoryId: item?.incomeCategoryId ?? (incomeCats[0]?.id ?? ''),
    expectedPaymentDate: item ? toInputDate(item.expectedPaymentDate) : todayISO(),
    grossAmount: item ? String(centsToFloat(item.grossAmount)) : '',
    separateReservePercentage: item?.separateReservePercentage ?? true,
    customerName: item?.customerName ?? '',
    invoiceNumber: item?.invoiceNumber ?? '',
    notes: item?.notes ?? '',
  });

  const [form, setForm] = useState<FormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const grossCents = floatToCents(parseFloat(form.grossAmount) || 0);
  const pct = form.separateReservePercentage ? defaultReservePct : 0;
  const reserveCents = Math.round((grossCents * pct) / 100);
  const netCents = grossCents - reserveCents;

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grossCents || !form.description || !form.incomeCategoryId) return;
    onSave({
      description: form.description,
      incomeCategoryId: form.incomeCategoryId,
      expectedPaymentDate: new Date(form.expectedPaymentDate).toISOString(),
      grossAmount: grossCents,
      separateReservePercentage: form.separateReservePercentage,
      customerName: form.customerName || null,
      invoiceNumber: form.invoiceNumber || null,
      notes: form.notes || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar Recebimento' : 'Novo Recebimento'}
      size="lg"
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
              {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Data prevista *">
            <input type="date" className={INPUT} value={form.expectedPaymentDate} onChange={set('expectedPaymentDate')} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor bruto (R$) *">
            <CurrencyInput
              className={INPUT}
              value={form.grossAmount}
              onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))}
            />
          </Field>
          <Field label="Cliente">
            <input className={INPUT} value={form.customerName} onChange={set('customerName')} placeholder="Nome do cliente" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.separateReservePercentage}
            onChange={(e) => setForm((f) => ({ ...f, separateReservePercentage: e.target.checked }))}
            className="rounded"
          />
          Separar reserva ({defaultReservePct}%)
        </label>
        {grossCents > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <div className="flex justify-between">
              <span>Reserva ({pct}%)</span>
              <span>{formatCurrency(reserveCents)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100">
              <span>Valor líquido</span>
              <span className="text-green-700 dark:text-green-400">{formatCurrency(netCents)}</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº da NF">
            <input className={INPUT} value={form.invoiceNumber} onChange={set('invoiceNumber')} placeholder="Ex: 12345" />
          </Field>
          <Field label="Observações">
            <input className={INPUT} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Receivables() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ item?: Receivable } | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['receivables'],
    queryFn: ReceivablesService.findAll,
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

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const defaultReservePct = settings?.defaultReservePercentage ?? 30;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['receivables'] });
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createMut = useMutation({
    mutationFn: ReceivablesService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateReceivablePayload> }) =>
      ReceivablesService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const receiveMut = useMutation({
    mutationFn: (id: string) => ReceivablesService.receive(id),
    onSuccess: invalidate,
  });
  const revertMut = useMutation({
    mutationFn: ReceivablesService.revert,
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: ReceivablesService.remove,
    onSuccess: invalidate,
  });

  const EFFECTED_CONFIRM = 'Este item já foi efetivado. Alterar este registro irá recalcular saldos e indicadores. Deseja continuar?';

  function save(payload: CreateReceivablePayload) {
    if (modal?.item?.status === 'RECEIVED' && !window.confirm(EFFECTED_CONFIRM)) return;
    if (modal?.item) {
      updateMut.mutate({ id: modal.item.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const filtered = items
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter(
      (r) =>
        !search ||
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        (r.customerName ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.expectedPaymentDate).getTime() - new Date(a.expectedPaymentDate).getTime()
  );

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(['ALL', 'EXPECTED', 'RECEIVED', 'CANCELED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {STATUS_LABELS[s]}
              {s !== 'ALL' && (
                <span className="ml-1 opacity-70">
                  ({items.filter((r) => r.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm w-52 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Buscar descrição / cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
            Novo
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {sorted.length === 0 ? (
          <EmptyState
            title="Nenhum recebimento encontrado"
            description="Clique em Novo para adicionar um recebimento"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Descrição</th>
                  <th className="text-left px-3 py-3 font-medium">Cliente</th>
                  <th className="text-left px-3 py-3 font-medium">Categoria</th>
                  <th className="text-right px-3 py-3 font-medium">Bruto</th>
                  <th className="text-right px-3 py-3 font-medium">Líquido</th>
                  <th className="text-left px-3 py-3 font-medium">Data prev.</th>
                  <th className="text-left px-3 py-3 font-medium">Recebido em</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {sorted.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer" onClick={() => setModal({ item })}>
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                      {item.description}
                      {item.invoiceNumber && (
                        <span className="ml-1.5 text-xs text-gray-400 font-normal">
                          NF {item.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {item.customerName ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {catMap.get(item.incomeCategoryId) ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(item.grossAmount)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-green-700 dark:text-green-400">
                      {formatCurrency(item.netAmount)}
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">
                      {formatDate(item.expectedPaymentDate)}
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">
                      {item.actualPaymentDate ? formatDate(item.actualPaymentDate) : '—'}
                    </td>
                    <td className="px-3 py-3">{receivableStatusBadge(item.status)}</td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.status === 'EXPECTED' && (
                          <button
                            title="Marcar como recebido"
                            onClick={() => receiveMut.mutate(item.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {item.status === 'RECEIVED' && (
                          <button
                            title="Reverter recebimento"
                            onClick={() => revertMut.mutate(item.id)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                        {item.status !== 'CANCELED' && (
                          <button
                            title="Editar"
                            onClick={() => setModal({ item })}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {item.status === 'EXPECTED' && (
                          <button
                            title="Excluir"
                            onClick={() => {
                              if (window.confirm('Confirmar exclusão?'))
                                deleteMut.mutate(item.id);
                            }}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 size={14} />
                          </button>
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

      <ReceivableModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        categories={categories}
        defaultReservePct={defaultReservePct}
        onSave={save}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}
