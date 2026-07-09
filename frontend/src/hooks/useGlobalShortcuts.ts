import { useEffect } from 'react';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

interface ShortcutHandlers {
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onQuickAdd: () => void;
  onToggleHelp: () => void;
}

// Atalhos globais da aplicação. Registrado uma única vez em App.tsx.
// Ignora teclas quando o foco está em um campo de digitação, para não
// atrapalhar a entrada de texto normal.
export function useGlobalShortcuts({ onPrevMonth, onNextMonth, onQuickAdd, onToggleHelp }: ShortcutHandlers): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrevMonth();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        onNextMonth();
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        onToggleHelp();
        return;
      }
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onQuickAdd();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onPrevMonth, onNextMonth, onQuickAdd, onToggleHelp]);
}
