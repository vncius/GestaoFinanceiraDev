import { useCallback, useEffect, useState } from 'react';

// Preferência "Mostrar detalhes avançados" (U19 do plano de UX): quando
// ligada, "Ver detalhes" de Movimentações e "Ver análise completa" do Início
// já abrem expandidos. Desligada, nada é escondido — só começa recolhido.
const KEY = 'pref.showAdvancedDetails';
const EVENT = 'pref-advanced-details-change';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function getAdvancedDetails(): boolean {
  return read();
}

export function useAdvancedDetails(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(read);

  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    setValue(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [value, set];
}
