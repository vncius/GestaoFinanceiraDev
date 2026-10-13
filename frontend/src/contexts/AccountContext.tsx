import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsService } from '../services/accounts.service';
import { SettingsService } from '../services/settings.service';
import { Account } from '../types';
import { useAuth } from './AuthContext';

interface AccountContextValue {
  // Última conta específica escolhida — sempre preenchida quando há contas.
  // Telas que exigem uma conta (Fluxo de Caixa) usam esta.
  accountId: string | null;
  setAccountId: (id: string) => void;
  // "Todas as contas" (D4 do plano de UX): escolha de visualização, não
  // configuração. Só tem efeito com mais de uma conta ativa.
  viewAll: boolean;
  setViewAll: (value: boolean) => void;
  // Escopo para telas que aceitam consolidado (Dashboard, Relatório):
  // null = todas as contas.
  scopeAccountId: string | null;
  accounts: Account[];
  activeAccount: Account | null;
}

const AccountContext = createContext<AccountContextValue | null>(null);

const storageKey = (tenantId: string) => `activeAccountId:${tenantId}`;
const viewAllKey = (tenantId: string) => `viewAllAccounts:${tenantId}`;

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    enabled: !!user,
    staleTime: 30_000,
  });

  // settings.dashboardScope só define o valor inicial do "Todas as contas"
  // no primeiro acesso do tenant; depois vale a escolha salva no seletor.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: SettingsService.get,
    enabled: !!user,
    staleTime: Infinity,
  });

  const [accountId, setAccountIdState] = useState<string | null>(null);
  const [storedViewAll, setStoredViewAll] = useState<boolean | null>(null);

  // Ao trocar de tenant (login/logout), recarrega a seleção salva daquele tenant
  // — nunca herda a seleção de um tenant anterior.
  useEffect(() => {
    setAccountIdState(tenantId ? localStorage.getItem(storageKey(tenantId)) : null);
    const saved = tenantId ? localStorage.getItem(viewAllKey(tenantId)) : null;
    setStoredViewAll(saved === null ? null : saved === 'true');
  }, [tenantId]);

  // Garante que a seleção aponta para uma conta que existe (ex.: primeiro
  // acesso sem nada salvo, ou a conta salva foi desativada/excluída).
  useEffect(() => {
    if (accounts.length === 0) return;
    if (accountId && accounts.some((a) => a.id === accountId)) return;
    setAccountId(accounts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, accountId]);

  function setAccountId(id: string) {
    if (id === accountId) return;
    setAccountIdState(id);
    if (tenantId) localStorage.setItem(storageKey(tenantId), id);
    // Reseta (em vez de só invalidar) as queries por conta: se o usuário já
    // tinha visitado a conta de destino antes, o cache guardado dela pode
    // estar desatualizado (ex.: uma transferência ou pagamento de fatura
    // feito enquanto ele estava em outra conta) e sem isso ficaria visível
    // por alguns segundos antes do refetch corrigir os números.
    queryClient.resetQueries({ queryKey: ['dashboard'] });
    queryClient.resetQueries({ queryKey: ['cashFlow'] });
  }

  function setViewAll(value: boolean) {
    setStoredViewAll(value);
    if (tenantId) localStorage.setItem(viewAllKey(tenantId), String(value));
  }

  const viewAll = storedViewAll ?? settings?.dashboardScope !== 'ACCOUNT';
  const scopeAccountId = viewAll && accounts.length > 1 ? null : accountId;
  const activeAccount = accounts.find((a) => a.id === accountId) ?? null;

  return (
    <AccountContext.Provider
      value={{ accountId, setAccountId, viewAll, setViewAll, scopeAccountId, accounts, activeAccount }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount deve ser usado dentro de AccountProvider');
  return ctx;
}
