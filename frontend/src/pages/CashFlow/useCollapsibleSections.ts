import { useCallback, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export type CashFlowSection = 'transfers' | 'entries' | 'payments' | 'extraExpenses' | 'creditCards';
type OverrideKey = `${CashFlowSection}:${'empty' | 'filled'}`;
type Overrides = Partial<Record<OverrideKey, boolean>>;

const storageKey = (tenantId: string | null | undefined) => `cashFlow.sectionsExpanded:${tenantId ?? 'anon'}`;

function readOverrides(key: string): Overrides {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

// Padrão: card com itens expandido, card vazio recolhido. A escolha do usuário
// é guardada separadamente para o estado "vazio" e "com itens" de cada card,
// assim recolher Pagamentos num mês cheio não afeta meses sem lançamentos e
// o primeiro item adicionado num card vazio expande automaticamente.
export function useCollapsibleSections() {
  const { user } = useAuth();
  const key = storageKey(user?.tenantId);
  // Leitura síncrona no inicializador para não piscar no primeiro render.
  const [overrides, setOverrides] = useState<Overrides>(() => readOverrides(key));

  const isExpanded = useCallback(
    (section: CashFlowSection, hasItems: boolean) =>
      overrides[`${section}:${hasItems ? 'filled' : 'empty'}`] ?? hasItems,
    [overrides],
  );

  const toggle = useCallback(
    (section: CashFlowSection, hasItems: boolean) => {
      setOverrides((prev) => {
        const k: OverrideKey = `${section}:${hasItems ? 'filled' : 'empty'}`;
        const next = { ...prev, [k]: !(prev[k] ?? hasItems) };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage indisponível */
        }
        return next;
      });
    },
    [key],
  );

  return { isExpanded, toggle };
}
