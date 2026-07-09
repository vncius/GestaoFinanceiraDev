import { Plus, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

export function GridHeader({
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

export function ActionBtn({
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
      aria-label={title}
      onClick={onClick}
      className={`p-1 sm:p-1.5 rounded-md transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export function PaidToggle({
  paid,
  urgent = false,
  onToggle,
  paidTitle,
  unpaidTitle,
}: {
  paid: boolean;
  urgent?: boolean;
  onToggle: () => void;
  paidTitle: string;
  unpaidTitle: string;
}) {
  return (
    <ActionBtn
      title={paid ? paidTitle : unpaidTitle}
      onClick={onToggle}
      className={
        paid
          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
          : urgent
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }
    >
      {paid ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
    </ActionBtn>
  );
}

// Shared column widths so Categoria/Valor/Data/Ações line up across the
// Entradas/Pagamentos/Gastos Extraordinários/Cartões grids, which each have a
// different set of columns. Grids missing a column render an empty cell with
// the same width/breakpoint instead of skipping it, so later columns stay aligned.
export const COL_CATEGORIA = 'hidden md:table-cell w-32';
export const COL_VALOR_SECUNDARIO = 'hidden lg:table-cell w-24'; // Valor Bruto / Reserva
export const COL_VALOR = 'w-28';
export const COL_DATA = 'hidden md:table-cell w-28';
export const COL_ACOES = 'w-24';
