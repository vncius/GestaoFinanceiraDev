import { useEffect, useRef, useState } from 'react';
import { Filter, Eraser, Search, Tags, X, MoreHorizontal, Upload, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Category } from '../../../types';
import { CashFlowTypeFilter } from '../types';
import { MOVEMENT_TAGS, MovementTag } from '../movements';
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

// Filtro por tipo (U10b): fixo, fora do comum, cartão, transferência. Nada
// marcado = todos; marcados = mostrar só os que têm algum deles.
function TagFilterPopover({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<MovementTag>;
  onToggle: (tag: MovementTag) => void;
  onClear: () => void;
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

  const active = selected.size > 0;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${
          active
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
      >
        <Tags size={13} />
        {t('filterBar.tags.button')}
        {active && <span>({selected.size})</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
          <p className="px-1 pb-1.5 mb-1 text-[11px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
            {t('filterBar.tags.hint')}
          </p>
          {MOVEMENT_TAGS.map((tag) => (
            <label
              key={tag}
              className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
            >
              <input type="checkbox" className="rounded" checked={selected.has(tag)} onChange={() => onToggle(tag)} />
              {t(`filterBar.tags.options.${tag}`)}
            </label>
          ))}
          {active && (
            <button type="button" onClick={onClear} className="mt-1 px-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
              {t('filterBar.tags.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Ações sobre o mês inteiro (U11): ficam fora da barra de filtros para não
// disputar atenção — e "Limpar mês", destrutiva, vai por último e em vermelho.
function MonthActionsMenu({
  onImportStatement,
  onExportExcel,
  onExportPdf,
  exporting,
  onClearAll,
  clearingAll,
  clearAllDisabled,
}: {
  onImportStatement: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  exporting: boolean;
  onClearAll: () => void;
  clearingAll: boolean;
  clearAllDisabled: boolean;
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

  const item = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left disabled:opacity-50 disabled:cursor-not-allowed';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('filterBar.monthActions')}
        title={t('filterBar.monthActions')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        {exporting || clearingAll ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1">
          <button role="menuitem" className={`${item} text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`} onClick={run(onImportStatement)}>
            <Upload size={15} /> {t('filterBar.importStatement')}
          </button>
          <button role="menuitem" className={`${item} text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`} onClick={run(onExportExcel)} disabled={exporting}>
            <FileSpreadsheet size={15} /> {t('filterBar.exportExcel')}
          </button>
          <button role="menuitem" className={`${item} text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`} onClick={run(onExportPdf)}>
            <FileText size={15} /> {t('filterBar.exportPdf')}
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button
            role="menuitem"
            className={`${item} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30`}
            onClick={run(onClearAll)}
            disabled={clearAllDisabled || clearingAll}
          >
            <Eraser size={15} /> {t('filterBar.clearAllButton')}
          </button>
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
  onImportStatement,
  onExportExcel,
  onExportPdf,
  exporting = false,
  clearingAll = false,
  clearAllDisabled = false,
  search,
  onSearchChange,
  tags,
  onToggleTag,
  onClearTags,
}: {
  typeFilter: CashFlowTypeFilter;
  onTypeChange: (v: CashFlowTypeFilter) => void;
  categories: Category[];
  excludedCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  onSelectAllCategories: () => void;
  onClearCategories: () => void;
  onClearAll: () => void;
  onImportStatement: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  exporting?: boolean;
  clearingAll?: boolean;
  clearAllDisabled?: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  tags: Set<MovementTag>;
  onToggleTag: (tag: MovementTag) => void;
  onClearTags: () => void;
}) {
  const { t } = useTranslation('cashFlow');
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="relative w-full sm:w-56">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('filterBar.searchPlaceholder')}
          aria-label={t('filterBar.searchPlaceholder')}
          className="w-full pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label={t('filterBar.clearSearch')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <TypeFilterToggle value={typeFilter} onChange={onTypeChange} />
      <CategoryFilterPopover
        categories={categories}
        typeFilter={typeFilter}
        excludedIds={excludedCategoryIds}
        onToggle={onToggleCategory}
        onSelectAll={onSelectAllCategories}
        onClearAll={onClearCategories}
      />
      <TagFilterPopover selected={tags} onToggle={onToggleTag} onClear={onClearTags} />
      <MonthActionsMenu
        onImportStatement={onImportStatement}
        onExportExcel={onExportExcel}
        onExportPdf={onExportPdf}
        exporting={exporting}
        onClearAll={onClearAll}
        clearingAll={clearingAll}
        clearAllDisabled={clearAllDisabled}
      />
    </div>
  );
}
