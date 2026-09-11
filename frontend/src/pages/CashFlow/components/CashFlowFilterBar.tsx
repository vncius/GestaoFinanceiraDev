import { useEffect, useRef, useState } from 'react';
import { Filter, Eraser, ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Category } from '../../../types';
import { CashFlowTypeFilter } from '../types';
import { Button } from '../../../components/ui/Button';
import { sortByName } from '../../../utils/sort';

function TypeFilterToggle({
  value,
  onChange,
}: {
  value: CashFlowTypeFilter;
  onChange: (v: CashFlowTypeFilter) => void;
}) {
  const { t } = useTranslation('cashFlow');
  const options: { value: CashFlowTypeFilter; label: string }[] = [
    { value: 'ALL', label: t('filterBar.typeToggle.all') },
    { value: 'INCOME', label: t('filterBar.typeToggle.income') },
    { value: 'EXPENSE', label: t('filterBar.typeToggle.expense') },
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
  const { t } = useTranslation('cashFlow');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const incomeCategories = sortByName(categories.filter((c) => c.type === 'INCOME'));
  const expenseCategories = sortByName(categories.filter((c) => c.type === 'EXPENSE'));
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
        {t('filterBar.categories.button')}
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
              {t('filterBar.categories.selectAll')}
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-gray-500 dark:text-gray-400 hover:underline"
            >
              {t('filterBar.categories.clear')}
            </button>
          </div>
          {(typeFilter === 'ALL' || typeFilter === 'INCOME') && renderGroup(t('filterBar.categories.incomeGroup'), incomeCategories)}
          {(typeFilter === 'ALL' || typeFilter === 'EXPENSE') && renderGroup(t('filterBar.categories.expenseGroup'), expenseCategories)}
        </div>
      )}
    </div>
  );
}

export function CashFlowFilterBar({
  typeFilter,
  onTypeChange,
  categories,
  excludedCategoryIds,
  onToggleCategory,
  onSelectAllCategories,
  onClearCategories,
  onClearAll,
  onNewTransfer,
  clearingAll = false,
  clearAllDisabled = false,
}: {
  typeFilter: CashFlowTypeFilter;
  onTypeChange: (v: CashFlowTypeFilter) => void;
  categories: Category[];
  excludedCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  onSelectAllCategories: () => void;
  onClearCategories: () => void;
  onClearAll: () => void;
  onNewTransfer: () => void;
  clearingAll?: boolean;
  clearAllDisabled?: boolean;
}) {
  const { t } = useTranslation('cashFlow');
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('filterBar.label')}</span>
      <TypeFilterToggle value={typeFilter} onChange={onTypeChange} />
      <CategoryFilterPopover
        categories={categories}
        typeFilter={typeFilter}
        excludedIds={excludedCategoryIds}
        onToggle={onToggleCategory}
        onSelectAll={onSelectAllCategories}
        onClearAll={onClearCategories}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<ArrowLeftRight size={14} />}
        onClick={onNewTransfer}
        className="ml-auto text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
      >
        {t('filterBar.newTransferButton')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<Eraser size={14} />}
        onClick={onClearAll}
        loading={clearingAll}
        disabled={clearAllDisabled}
        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
      >
        {t('filterBar.clearAllButton')}
      </Button>
    </div>
  );
}
