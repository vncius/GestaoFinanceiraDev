import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void; // YYYY-MM-DD
  className?: string;
  required?: boolean;
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

export function DateInput({ value, onChange, className = '', required }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`relative flex items-center gap-2 cursor-pointer ${className} focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent`}
    >
      <span className="flex-1 select-none pointer-events-none">
        {isoToDisplay(value) || (
          <span className="text-gray-400 dark:text-gray-500">dd/mm/aaaa</span>
        )}
      </span>
      <CalendarDays size={14} className="text-gray-400 dark:text-gray-500 shrink-0 pointer-events-none" />
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
}
