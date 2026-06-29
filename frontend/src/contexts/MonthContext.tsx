import { createContext, useContext, useState, ReactNode } from 'react';

interface MonthContextValue {
  month: number;
  year: number;
  nextMonth: () => void;
  prevMonth: () => void;
  setMonthYear: (month: number, year: number) => void;
}

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  return (
    <MonthContext.Provider
      value={{ month, year, nextMonth, prevMonth, setMonthYear: (m, y) => { setMonth(m); setYear(y); } }}
    >
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth deve ser usado dentro de MonthProvider');
  return ctx;
}
