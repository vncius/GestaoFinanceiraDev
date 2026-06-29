import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonth } from '../../contexts/MonthContext';
import { formatMonthYear } from '../../utils/date';

export function MonthNavigator() {
  const { month, year, nextMonth, prevMonth } = useMonth();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={prevMonth}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-gray-700 min-w-[148px] text-center select-none">
        {formatMonthYear(month, year)}
      </span>
      <button
        onClick={nextMonth}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
