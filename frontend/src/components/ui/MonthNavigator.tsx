import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { formatMonthYear } from '../../utils/date';

export function MonthNavigator() {
  const { month, year, nextMonth, prevMonth } = useMonth();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={prevMonth}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-base font-bold text-gray-800 dark:text-gray-100 min-w-[172px] text-center select-none">
        {formatMonthYear(month, year)}
      </span>
      <button
        onClick={nextMonth}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        aria-label="Próximo mês"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
