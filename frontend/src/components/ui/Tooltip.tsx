import { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

// Tooltip acessível em hover, foco (teclado) e toque (focus via tabIndex),
// já que o `title` nativo não funciona em telas touch.
export function HelpTip({ text }: { text: ReactNode }) {
  return (
    <span
      tabIndex={0}
      onClick={(e) => e.preventDefault()}
      className="relative inline-flex align-middle group cursor-help focus:outline-none"
    >
      <HelpCircle size={14} className="text-gray-400 dark:text-gray-500" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-xs leading-relaxed px-3 py-2 shadow-lg z-20 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
      >
        {text}
      </span>
    </span>
  );
}
