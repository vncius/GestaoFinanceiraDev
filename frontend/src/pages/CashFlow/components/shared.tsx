import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { IconActionButton } from '../../../components/ui/IconActionButton';

export { PaidToggle } from '../../../components/ui/PaidToggle';

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
  disabled = false,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('cashFlow');
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({count})</span>
      </div>
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={onAdd} disabled={disabled}>
        {t('grid.new')}
      </Button>
    </div>
  );
}

export function ActionBtn({
  title,
  onClick,
  className = '',
  loading = false,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <IconActionButton title={title} onClick={onClick} className={className} loading={loading} disabled={disabled}>
      {children}
    </IconActionButton>
  );
}

// Shared column widths so Conta/Valor/Data/Ações line up across the
// Entradas/Pagamentos/Gastos Extraordinários/Cartões grids, which each have a
// different set of columns. Grids missing a column render an empty cell with
// the same width/breakpoint instead of skipping it, so later columns stay aligned.
export const COL_CONTA = 'hidden md:table-cell w-32';
export const COL_VALOR_SECUNDARIO = 'hidden lg:table-cell w-24'; // Valor Bruto / Reserva
export const COL_VALOR = 'w-28';
export const COL_DATA = 'hidden md:table-cell w-28';
export const COL_ACOES = 'w-24';
