import { useEffect, useRef, useState } from 'react';
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
  ChevronUp,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { CashFlowService, CreateTransactionPayload } from '../../services/cash-flow.service';
import { ReceivablesService, CreateReceivablePayload } from '../../services/receivables.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { CategoriesService } from '../../services/categories.service';
import { SettingsService } from '../../services/settings.service';
import { AccountsService } from '../../services/accounts.service';
import {
  Account,
  CashFlowSummary,
  Category,
  CreditCardInvoice,
  FinancialTransaction,
  Receivable,
  RecurrenceType,
} from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ScopedDeleteModal } from '../../components/ui/ScopedDeleteModal';
import { Badge, receivableStatusBadge, transactionStatusBadge, invoiceStatusBadge } from '../../components/ui/Badge';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { DateInput } from '../../components/ui/DateInput';
import { PayInvoiceAccountModal } from '../../components/ui/PayInvoiceAccountModal';
import { formatCurrency, floatToCents, centsToFloat } from '../../utils/money';
import { formatDate, toInputDate, todayISO, firstDayOfMonthISO, monthYearFromDate } from '../../utils/date';
import { useDialog } from '../../contexts/DialogContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  UNIQUE: 'Único',
  FIXED: 'Fixo (recorrente)',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalKind =
  | { type: 'receivable'; mode: 'create' | 'edit'; item?: Receivable }
  | { type: 'payment' | 'extra-expense'; mode: 'create' | 'edit'; item?: FinancialTransaction };

type CashFlowTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';

// ── Shared form helpers ───────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryCell({
  label,
  value,
  color,
  bold = false,
  border = true,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-2 py-1 lg:py-0 lg:w-[150px] lg:shrink-0 ${border ? 'lg:border-r border-gray-100 dark:border-gray-700' : ''}`}
    >
      <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{label}</span>
      <span className={`text-xs whitespace-nowrap ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function SummaryRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-y-1 lg:flex lg:items-center lg:justify-end lg:gap-0 flex-1">
      {children}
    </div>
  );
}

function SummaryBar({
  summary: s,
  expanded,
  onToggleExpanded,
}: {
  summary: CashFlowSummary;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const totalPaid = s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices;
  const totalExpected = s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices;

  const saldoColor = s.realizedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const prevSaldoColor = s.projectedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const initialColor = 'text-gray-600 dark:text-gray-300';

  return (
    <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-md dark:shadow-gray-900 z-10 rounded-xl">
      <div className="flex items-center px-2 sm:px-4 py-2">
        <SummaryRow>
          <SummaryCell label="Inicial" value={s.initialBalance} color={initialColor} />
          <SummaryCell label="Entradas" value={s.receivedIncome} color="text-green-600 dark:text-green-400" />
          <SummaryCell label="Saídas" value={totalPaid} color="text-red-500 dark:text-red-400" />
          <SummaryCell label="Saldo Final" value={s.realizedBalance} color={saldoColor} bold border={false} />
        </SummaryRow>
        <button
          onClick={onToggleExpanded}
          className="shrink-0 ml-2 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={expanded ? 'Recolher' : 'Ver previstos'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700 sm:border-t-0">
            <SummaryRow>
              <SummaryCell label="Saldo Inicial Previsto" value={s.projectedInitialBalance} color={initialColor} />
              <SummaryCell label="Prev. Entradas" value={s.expectedIncome} color="text-green-600 dark:text-green-400" />
              <SummaryCell label="Prev. Saídas" value={totalExpected} color="text-red-500 dark:text-red-400" />
              <SummaryCell label="Prev. Saldo" value={s.projectedBalance} color={prevSaldoColor} bold border={false} />
            </SummaryRow>
            <div aria-hidden="true" className="invisible shrink-0 ml-2 p-1.5 rounded-lg">
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="flex items-center px-2 sm:px-4 py-2 border-t border-gray-100 dark:border-gray-700">
            <SummaryRow>
              <SummaryCell label="Previsão Inicial Reserva" value={s.reserveProjectedInitialBalance} color={initialColor} />
              <SummaryCell label="Entradas Reserva" value={s.reserveInflow} color="text-amber-600 dark:text-amber-400" />
              <SummaryCell label="Saídas Reserva" value={s.reserveOutflow} color="text-amber-500 dark:text-amber-400" />
              <SummaryCell label="Saldo Reserva" value={s.reserveEndBalance} color="text-amber-600 dark:text-amber-400" bold border={false} />
            </SummaryRow>
            <div aria-hidden="true" className="invisible shrink-0 ml-2 p-1.5 rounded-lg">
              <ChevronDown size={14} />
            </div>
          </div>
        </>
      )}
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
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({count})</span>
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
      className={`p-1 sm:p-1.5 rounded-md transition-colors ${className}`}
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
  onDelete: (item: Receivable) => void;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
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
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-3 sm:px-5 py-2.5 font-medium">Descrição</th>
                <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="hidden lg:table-cell text-right px-3 py-2.5 font-medium">Valor Bruto</th>
                <th className="hidden lg:table-cell text-right px-3 py-2.5 font-medium">Reserva</th>
                <th className="text-right px-2 sm:px-3 py-2.5 font-medium">Valor líquido</th>
                <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">Data prev.</th>
                <th className="text-left px-2 sm:px-3 py-2.5 font-medium">Status</th>
                <th className="px-1 sm:px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group">
                  <td
                    className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 max-w-[90px] sm:max-w-none truncate"
                    onClick={() => onEdit(item)}
                  >
                    {item.description}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {catMap.get(item.incomeCategoryId) ?? '—'}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-3 text-right text-gray-600 dark:text-gray-300">
                    {formatCurrency(item.grossAmount)}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-3 text-right text-amber-600 dark:text-amber-400 text-xs">
                    {item.reserveAmount > 0 ? formatCurrency(item.reserveAmount) : '—'}
                  </td>
                  <td className="px-2 sm:px-3 py-3 text-right font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">
                    {formatCurrency(item.netAmount)}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">
                    {formatDate(item.expectedPaymentDate)}
                  </td>
                  <td className="px-2 sm:px-3 py-3">{receivableStatusBadge(item.status)}</td>
                  <td className="px-1 sm:px-3 py-3">
                    <div className="flex items-center gap-0 sm:gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {item.status === 'EXPECTED' && (
                        <ActionBtn
                          title="Marcar como recebido"
                          onClick={() => onReceive(item.id)}
                          className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                        >
                          <CheckCircle2 size={16} />
                        </ActionBtn>
                      )}
                      {item.status === 'RECEIVED' && (
                        <ActionBtn
                          title="Reverter recebimento"
                          onClick={() => onRevert(item.id)}
                          className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                        >
                          <RotateCcw size={15} />
                        </ActionBtn>
                      )}
                      <ActionBtn
                        title="Editar"
                        onClick={() => onEdit(item)}
                        className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil size={14} />
                      </ActionBtn>
                      {item.status === 'EXPECTED' && (
                        <ActionBtn
                          title="Excluir"
                          onClick={() => onDelete(item)}
                          className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
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
  onDelete: (item: FinancialTransaction) => void;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <GridHeader title={title} icon={icon} count={items.length} onAdd={onAdd} />

      {items.length === 0 ? (
        <EmptyState title="Nenhum registro neste mês" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-3 sm:px-5 py-2.5 font-medium">Descrição</th>
                <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="text-right px-3 py-2.5 font-medium">Valor</th>
                <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">Data lanç.</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="px-2 sm:px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group">
                  <td
                    className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 max-w-[120px] sm:max-w-none truncate"
                    onClick={() => onEdit(item)}
                  >
                    {item.description}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {catMap.get(item.categoryId ?? '') ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">
                    {formatDate(item.expectedDate)}
                  </td>
                  <td className="px-3 py-3">{transactionStatusBadge(item.status)}</td>
                  <td className="px-2 sm:px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {item.status === 'PENDING' && (
                        <ActionBtn
                          title="Marcar como pago"
                          onClick={() => onPay(item.id)}
                          className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                        >
                          <CheckCircle2 size={16} />
                        </ActionBtn>
                      )}
                      {item.status === 'PAID' && (
                        <ActionBtn
                          title="Reverter pagamento"
                          onClick={() => onRevert(item.id)}
                          className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                        >
                          <RotateCcw size={15} />
                        </ActionBtn>
                      )}
                      {item.status !== 'CANCELED' && item.status !== 'REVERSED' && (
                        <ActionBtn
                          title="Editar"
                          onClick={() => onEdit(item)}
                          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil size={14} />
                        </ActionBtn>
                      )}
                      {item.status === 'PENDING' && (
                        <ActionBtn
                          title="Excluir"
                          onClick={() => onDelete(item)}
                          className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
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
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        <CreditCard size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Cartões de Crédito</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              <th className="text-left px-3 sm:px-5 py-2.5 font-medium">Cartão</th>
              <th className="text-right px-3 py-2.5 font-medium">Valor fatura</th>
              <th className="hidden md:table-cell text-left px-3 py-2.5 font-medium">Vencimento</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
              <th className="px-2 sm:px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {items.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group">
                <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[100px] sm:max-w-none truncate">
                  {cardNames.get(inv.creditCardId) ?? 'Cartão'}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-purple-700 dark:text-purple-400 whitespace-nowrap">
                  {formatCurrency(inv.totalAmount)}
                </td>
                <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">{formatDate(inv.dueDate)}</td>
                <td className="px-3 py-3">{invoiceStatusBadge(inv.status)}</td>
                <td className="px-2 sm:px-3 py-3">
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {(inv.status === 'OPEN' || inv.status === 'OVERDUE') && (
                      <ActionBtn
                        title="Pagar fatura"
                        onClick={() => onPay(inv)}
                        className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      >
                        <CheckCircle2 size={16} />
                      </ActionBtn>
                    )}
                    {inv.status === 'PAID' && (
                      <ActionBtn
                        title="Reverter pagamento"
                        onClick={() => onRevert(inv)}
                        className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"
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
  targetAccountId: string;
  notes: string;
  recurrence: RecurrenceType;
}

function ReceivableModal({
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
          {!isEdit && (
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

// ── Transaction Modal (Payment / Extra Expense) ───────────────────────────────

interface TxFormState {
  description: string;
  categoryId: string;
  amount: string;
  expectedDate: string;
  accountId: string;
  notes: string;
  recurrence: RecurrenceType;
}

function TransactionModal({
  open,
  onClose,
  type,
  item,
  categories,
  accounts,
  mainAccountId,
  month,
  year,
  onSave,
  isSaving,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  type: 'payment' | 'extra-expense';
  item?: FinancialTransaction;
  categories: Category[];
  accounts: Account[];
  mainAccountId: string | null;
  month: number;
  year: number;
  onSave: (data: CreateTransactionPayload) => void;
  isSaving: boolean;
  onPay?: (id: string) => void;
}) {
  const isEdit = !!item;
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const activeAccounts = accounts.filter((a) => a.active);
  const title = type === 'payment'
    ? (isEdit ? 'Editar Pagamento' : 'Novo Pagamento')
    : (isEdit ? 'Editar Gasto Extraordinário' : 'Novo Gasto Extraordinário');

  const init = (): TxFormState => ({
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? (expenseCategories[0]?.id ?? ''),
    amount: item ? String(centsToFloat(item.amount)) : '',
    expectedDate: item ? toInputDate(item.expectedDate) : firstDayOfMonthISO(month, year),
    accountId: item?.sourceAccountId ?? mainAccountId ?? '',
    notes: item?.notes ?? '',
    recurrence: item?.recurrence ?? 'UNIQUE',
  });

  const [form, setForm] = useState<TxFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = floatToCents(parseFloat(form.amount) || 0);
    const missing = getMissingFields([
      { label: 'Descrição', valid: !!form.description },
      { label: 'Categoria', valid: !!form.categoryId },
      { label: 'Valor', valid: !!amount },
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      description: form.description,
      categoryId: form.categoryId,
      amount,
      expectedDate: new Date(form.expectedDate).toISOString(),
      sourceAccountId: form.accountId || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
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
          {isEdit && item?.status === 'PENDING' && onPay && (
            <Button
              variant="secondary"
              icon={<CheckCircle2 size={14} />}
              onClick={() => { onPay(item!.id); onClose(); }}
            >
              Pagar
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
            <select className={INPUT} value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">Selecione...</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Data de lançamento *">
            <DateInput className={INPUT} value={form.expectedDate} onChange={(v) => setForm((f) => ({ ...f, expectedDate: v }))} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor *">
            <CurrencyInput
              className={INPUT}
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </Field>
          <Field label="Conta de débito">
            <select className={INPUT} value={form.accountId} onChange={set('accountId')}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {!isEdit && (
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
        <Field label="Observações">
          <textarea className={INPUT} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

function TypeFilterToggle({
  value,
  onChange,
}: {
  value: CashFlowTypeFilter;
  onChange: (v: CashFlowTypeFilter) => void;
}) {
  const options: { value: CashFlowTypeFilter; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'INCOME', label: 'Entradas' },
    { value: 'EXPENSE', label: 'Saídas' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            i > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
          } ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CategoryFilterPopover({
  categories,
  typeFilter,
  excludedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  categories: Category[];
  typeFilter: CashFlowTypeFilter;
  excludedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const incomeCategories = categories.filter((c) => c.type === 'INCOME');
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const selectedCount = categories.length - excludedIds.size;

  const renderGroup = (label: string, group: Category[]) =>
    group.length > 0 && (
      <div className="mb-2 last:mb-0">
        <p className="px-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
          {label}
        </p>
        {group.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
          >
            <input
              type="checkbox"
              className="rounded"
              checked={!excludedIds.has(c.id)}
              onChange={() => onToggle(c.id)}
            />
            {c.name}
          </label>
        ))}
      </div>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        <Filter size={13} />
        Categorias
        <span className="text-gray-400 dark:text-gray-500">
          ({selectedCount}/{categories.length})
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-gray-500 dark:text-gray-400 hover:underline"
            >
              Limpar
            </button>
          </div>
          {(typeFilter === 'ALL' || typeFilter === 'INCOME') && renderGroup('Entradas', incomeCategories)}
          {(typeFilter === 'ALL' || typeFilter === 'EXPENSE') && renderGroup('Saídas', expenseCategories)}
        </div>
      )}
    </div>
  );
}

function CashFlowFilterBar({
  typeFilter,
  onTypeChange,
  categories,
  excludedCategoryIds,
  onToggleCategory,
  onSelectAllCategories,
  onClearCategories,
}: {
  typeFilter: CashFlowTypeFilter;
  onTypeChange: (v: CashFlowTypeFilter) => void;
  categories: Category[];
  excludedCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  onSelectAllCategories: () => void;
  onClearCategories: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filtros:</span>
      <TypeFilterToggle value={typeFilter} onChange={onTypeChange} />
      <CategoryFilterPopover
        categories={categories}
        typeFilter={typeFilter}
        excludedIds={excludedCategoryIds}
        onToggle={onToggleCategory}
        onSelectAll={onSelectAllCategories}
        onClearAll={onClearCategories}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CashFlow() {
  const { month, year } = useMonth();
  const qc = useQueryClient();

  const { confirm } = useDialog();

  const cfKey = ['cashFlow', month, year] as const;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: cfKey });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

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
    queryFn: () => CreditCardsService.findAll(),
    staleTime: 60_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: Infinity,
  });

  const cardNames = new Map(cards.map((c) => [c.id, c.name]));

  // ── Summary bar state ────────────────────────────────────────────────────────
  // Vive no componente da página (que não desmonta ao trocar de mês) para que
  // o estado expandido/recolhido sobreviva à troca de referência.
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<CashFlowTypeFilter>('ALL');
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());
  const toggleCategoryFilter = (id: string) =>
    setExcludedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalKind | null>(null);
  const closeModal = () => setModal(null);
  const [invoicePayTarget, setInvoicePayTarget] = useState<CreditCardInvoice | null>(null);
  const [fixedDeleteTarget, setFixedDeleteTarget] = useState<
    | { kind: 'receivable'; item: Receivable }
    | { kind: 'payment' | 'extra-expense'; item: FinancialTransaction }
    | null
  >(null);

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
    mutationFn: ({ id, scope, month: m, year: y }: { id: string; scope?: 'CURRENT' | 'CURRENT_AND_FUTURE'; month?: number; year?: number }) =>
      ReceivablesService.remove(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); setFixedDeleteTarget(null); },
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
    mutationFn: ({ id, scope, month: m, year: y }: { id: string; scope?: 'CURRENT' | 'CURRENT_AND_FUTURE'; month?: number; year?: number }) =>
      CashFlowService.deletePayment(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); setFixedDeleteTarget(null); },
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
    mutationFn: ({ id, scope, month: m, year: y }: { id: string; scope?: 'CURRENT' | 'CURRENT_AND_FUTURE'; month?: number; year?: number }) =>
      CashFlowService.deleteExtraExpense(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); setFixedDeleteTarget(null); },
  });

  // ── Invoice mutations ────────────────────────────────────────────────────────
  const payInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId, accountId }: { cardId: string; invoiceId: string; accountId?: string }) =>
      CreditCardsService.payInvoice(cardId, invoiceId, accountId ? { paymentAccountId: accountId } : undefined),
    onSuccess: () => { invalidate(); setInvoicePayTarget(null); },
  });
  const revertInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId }: { cardId: string; invoiceId: string }) =>
      CreditCardsService.revertInvoice(cardId, invoiceId),
    onSuccess: invalidate,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const EFFECTED_CONFIRM = 'Este item já foi efetivado. Alterar este registro irá recalcular saldos e indicadores. Deseja continuar?';

  async function saveReceivable(payload: CreateReceivablePayload) {
    if (modal?.type !== 'receivable') return;
    if (modal.item?.status === 'RECEIVED' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      updateReceivable.mutate({ id: modal.item.id, data: payload });
    } else {
      createReceivable.mutate(payload);
    }
  }

  async function saveTransaction(payload: CreateTransactionPayload) {
    if (modal?.type !== 'payment' && modal?.type !== 'extra-expense') return;
    const isPayment = modal.type === 'payment';
    if (modal.item?.status === 'PAID' && !(await confirm(EFFECTED_CONFIRM))) return;
    if (modal.item) {
      if (isPayment) updatePayment.mutate({ id: modal.item.id, data: payload });
      else updateExtra.mutate({ id: modal.item.id, data: payload });
    } else {
      if (isPayment) createPayment.mutate(payload);
      else createExtra.mutate(payload);
    }
  }

  function handleTxPay(id: string) {
    if (modal?.type === 'payment') payPayment.mutate(id);
    else if (modal?.type === 'extra-expense') payExtra.mutate(id);
  }

  async function confirmDelete(fn: () => void) {
    if (await confirm('Confirmar exclusão?')) fn();
  }

  function handleDeleteReceivable(item: Receivable) {
    if (item.recurrence === 'FIXED') setFixedDeleteTarget({ kind: 'receivable', item });
    else confirmDelete(() => deleteReceivable.mutate({ id: item.id }));
  }

  function handleDeleteTransaction(kind: 'payment' | 'extra-expense', item: FinancialTransaction) {
    if (item.recurrence === 'FIXED') setFixedDeleteTarget({ kind, item });
    else confirmDelete(() => (kind === 'payment' ? deletePayment : deleteExtra).mutate({ id: item.id }));
  }

  function runScopedDelete(scope: 'CURRENT' | 'CURRENT_AND_FUTURE') {
    if (!fixedDeleteTarget) return;
    const { month: m, year: y } = monthYearFromDate(
      fixedDeleteTarget.kind === 'receivable'
        ? fixedDeleteTarget.item.expectedPaymentDate
        : fixedDeleteTarget.item.expectedDate,
    );
    if (fixedDeleteTarget.kind === 'receivable') {
      deleteReceivable.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    } else if (fixedDeleteTarget.kind === 'payment') {
      deletePayment.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    } else {
      deleteExtra.mutate({ id: fixedDeleteTarget.item.id, scope, month: m, year: y });
    }
  }

  if (isLoading || !data) return <PageLoading />;

  const { entries, payments, extraExpenses, creditCards, summary } = data;
  const defaultReservePct = settings?.defaultReservePercentage ?? 30;

  const showIncome = typeFilter === 'ALL' || typeFilter === 'INCOME';
  const showExpense = typeFilter === 'ALL' || typeFilter === 'EXPENSE';
  const filteredEntries = showIncome
    ? entries.filter((item) => !excludedCategoryIds.has(item.incomeCategoryId))
    : [];
  const filterTransactions = (items: FinancialTransaction[]) =>
    showExpense
      ? items.filter((item) => !item.categoryId || !excludedCategoryIds.has(item.categoryId))
      : [];
  const filteredPayments = filterTransactions(payments);
  const filteredExtraExpenses = filterTransactions(extraExpenses);
  const filteredCreditCards = showExpense ? creditCards : [];

  const txSaving =
    createPayment.isPending || updatePayment.isPending ||
    createExtra.isPending || updateExtra.isPending;

  const rxSaving = createReceivable.isPending || updateReceivable.isPending;

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 space-y-4 pb-4">
        {/* Filtros */}
        <CashFlowFilterBar
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          categories={categories}
          excludedCategoryIds={excludedCategoryIds}
          onToggleCategory={toggleCategoryFilter}
          onSelectAllCategories={() => setExcludedCategoryIds(new Set())}
          onClearCategories={() => setExcludedCategoryIds(new Set(categories.map((c) => c.id)))}
        />

        {/* Entradas */}
        <EntriesGrid
          items={filteredEntries}
          categories={categories}
          onAdd={() => setModal({ type: 'receivable', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'receivable', mode: 'edit', item })}
          onReceive={(id) => receiveItem.mutate(id)}
          onRevert={(id) => revertReceivable.mutate(id)}
          onDelete={handleDeleteReceivable}
        />

        {/* Pagamentos */}
        <TransactionGrid
          title="Pagamentos"
          icon={<TrendingDown size={16} className="text-red-500" />}
          items={filteredPayments}
          categories={categories}
          onAdd={() => setModal({ type: 'payment', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'payment', mode: 'edit', item })}
          onPay={(id) => payPayment.mutate(id)}
          onRevert={(id) => revertPayment.mutate(id)}
          onDelete={(item) => handleDeleteTransaction('payment', item)}
        />

        {/* Gastos Extraordinários */}
        <TransactionGrid
          title="Gastos Extraordinários"
          icon={<TrendingDown size={16} className="text-orange-500" />}
          items={filteredExtraExpenses}
          categories={categories}
          onAdd={() => setModal({ type: 'extra-expense', mode: 'create' })}
          onEdit={(item) => setModal({ type: 'extra-expense', mode: 'edit', item })}
          onPay={(id) => payExtra.mutate(id)}
          onRevert={(id) => revertExtra.mutate(id)}
          onDelete={(item) => handleDeleteTransaction('extra-expense', item)}
        />

        {/* Cartões de Crédito */}
        <CreditCardsGrid
          items={filteredCreditCards}
          cardNames={cardNames}
          onPay={(inv) => setInvoicePayTarget(inv)}
          onRevert={(inv) => revertInvoice.mutate({ cardId: inv.creditCardId, invoiceId: inv.id })}
        />
      </div>

      {/* Summary bar */}
      <SummaryBar
        summary={summary}
        expanded={summaryExpanded}
        onToggleExpanded={() => setSummaryExpanded((e) => !e)}
      />

      {/* Receivable Modal */}
      <ReceivableModal
        open={modal?.type === 'receivable'}
        onClose={closeModal}
        item={modal?.type === 'receivable' ? modal.item : undefined}
        categories={categories}
        accounts={accounts as Account[]}
        mainAccountId={settings?.mainAccountId ?? null}
        reserveAccountId={settings?.emergencyReserveAccountId ?? null}
        defaultReservePct={defaultReservePct}
        onSave={saveReceivable}
        isSaving={rxSaving}
        onReceive={(id) => { receiveItem.mutate(id); }}
      />

      {/* Transaction Modal */}
      {(modal?.type === 'payment' || modal?.type === 'extra-expense') && (
        <TransactionModal
          open
          onClose={closeModal}
          type={modal.type}
          item={modal.item}
          categories={categories}
          accounts={accounts as Account[]}
          mainAccountId={settings?.mainAccountId ?? null}
          month={month}
          year={year}
          onSave={saveTransaction}
          isSaving={txSaving}
          onPay={handleTxPay}
        />
      )}

      {/* Scoped delete for fixed (recurring) entries */}
      <ScopedDeleteModal
        open={!!fixedDeleteTarget}
        onClose={() => setFixedDeleteTarget(null)}
        title="Excluir lançamento fixo"
        loading={deleteReceivable.isPending || deletePayment.isPending || deleteExtra.isPending}
        description={
          <>
            <strong>{fixedDeleteTarget?.item.description}</strong> é um lançamento fixo. Deseja excluir
            apenas esta referência, ou esta e todas as futuras? O histórico de referências já
            lançadas/pagas/recebidas nunca é alterado.
          </>
        }
        onDeleteCurrent={() => runScopedDelete('CURRENT')}
        onDeleteFuture={() => runScopedDelete('CURRENT_AND_FUTURE')}
      />

      {/* Invoice payment account picker */}
      <PayInvoiceAccountModal
        open={!!invoicePayTarget}
        onClose={() => setInvoicePayTarget(null)}
        accounts={accounts as Account[]}
        isPaying={payInvoice.isPending}
        onConfirm={(accountId) => {
          if (invoicePayTarget) {
            payInvoice.mutate({
              cardId: invoicePayTarget.creditCardId,
              invoiceId: invoicePayTarget.id,
              accountId,
            });
          }
        }}
      />
    </div>
  );
}
