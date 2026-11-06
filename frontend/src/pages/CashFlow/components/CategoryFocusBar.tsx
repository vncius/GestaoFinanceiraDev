import { Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../../utils/money';

// Filtro por categoria aberto pelo Início: diz o que está na tela, repete o
// total do card para conferir e oferece a saída.
export function CategoryFocusBar({
  names,
  total,
  onClear,
}: {
  names: string[];
  total: number;
  onClear: () => void;
}) {
  const { t } = useTranslation('cashFlow');
  return (
    <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-200">
      <Filter size={14} className="shrink-0" />
      <p className="min-w-0 flex-1 truncate" title={names.join(', ')}>
        <span className="font-semibold">{names.join(', ')}</span>
      </p>
      <span className="shrink-0 text-xs">
        {t('movements.focus.total')} <span className="font-semibold">{formatCurrency(total)}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={t('movements.focus.clear')}
        title={t('movements.focus.clear')}
        className="shrink-0 p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50"
      >
        <X size={15} />
      </button>
    </div>
  );
}
