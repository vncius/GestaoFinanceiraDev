import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMonth } from '../../contexts/MonthContext';
import { formatMonthYear } from '../../utils/date';

export function MonthNavigator() {
  const { t } = useTranslation('common');
  const { month, year, nextMonth, prevMonth } = useMonth();

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={prevMonth}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        aria-label={t('monthNavigator.previousMonth')}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-100 min-w-[104px] sm:min-w-[140px] text-center select-none truncate">
        {formatMonthYear(month, year)}
      </span>
      <button
        onClick={nextMonth}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        aria-label={t('monthNavigator.nextMonth')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
