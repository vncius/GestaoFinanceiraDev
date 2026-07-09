import { createContext, ReactNode, useContext, useState } from 'react';
import { QuickAddModal } from '../components/quick-add/QuickAddModal';

interface QuickAddContextValue {
  openQuickAdd: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <QuickAddContext.Provider value={{ openQuickAdd: () => setOpen(true) }}>
      {children}
      <QuickAddModal open={open} onClose={() => setOpen(false)} />
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd must be used within a QuickAddProvider');
  return ctx;
}
