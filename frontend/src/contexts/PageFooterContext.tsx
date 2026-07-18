import { createContext, useContext, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

const PageFooterContext = createContext<HTMLDivElement | null>(null);

/**
 * Renderiza o slot real (dentro do fluxo flex do Layout, logo após o <main>)
 * e disponibiliza seu nó via contexto para as páginas portarem conteúdo nele.
 * Assim uma barra fixa de página (ex.: SummaryBar do fluxo de caixa) ocupa
 * espaço de verdade no layout — o <main> encolhe quando ela expande, em vez
 * de sobrepor o conteúdo com position fixed/padding.
 */
export function PageFooterProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <PageFooterContext.Provider value={slot}>
      {children}
      <div ref={setSlot} className="shrink-0" />
    </PageFooterContext.Provider>
  );
}

export function PageFooter({ children }: { children: ReactNode }) {
  const slot = useContext(PageFooterContext);
  if (!slot) return null;
  return createPortal(children, slot);
}
