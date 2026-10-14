import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

const EDGE = 8; // folga mínima até a borda da tela, em px

// Tooltip acessível em hover, foco (teclado) e toque (focus via tabIndex),
// já que o `title` nativo não funciona em telas touch.
//
// O balão só existe no layout enquanto está aberto e, ao abrir, se desloca
// para caber na tela. Antes ele ficava sempre montado (só transparente) e,
// perto da borda direita, alargava a página — barra de rolagem horizontal no
// iPhone em Movimentações.
export function HelpTip({ text }: { text: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const bubble = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !bubble.current) return;
    const rect = bubble.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // rect já inclui o deslocamento atual; recalcula a partir do centro.
    const left = rect.left - shift;
    const right = rect.right - shift;
    if (right > vw - EDGE) setShift(vw - EDGE - right);
    else if (left < EDGE) setShift(EDGE - left);
    else setShift(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span
      tabIndex={0}
      onClick={(e) => e.preventDefault()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="relative inline-flex align-middle cursor-help focus:outline-none"
    >
      <HelpCircle size={14} className="text-gray-400 dark:text-gray-500" />
      {open && (
        <span
          ref={bubble}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="pointer-events-none absolute left-1/2 bottom-full mb-2 w-64 max-w-[calc(100vw-1rem)] rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-xs leading-relaxed px-3 py-2 shadow-lg z-20"
        >
          {text}
        </span>
      )}
    </span>
  );
}
