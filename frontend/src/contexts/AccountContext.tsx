import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountsService } from '../services/accounts.service';
import { Account } from '../types';
import { useAuth } from './AuthContext';

interface AccountContextValue {
  accountId: string | null;
  setAccountId: (id: string) => void;
  accounts: Account[];
  activeAccount: Account | null;
}

const AccountContext = createContext<AccountContextValue | null>(null);

const storageKey = (tenantId: string) => `activeAccountId:${tenantId}`;

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    enabled: !!user,
    staleTime: 30_000,
  });

  const [accountId, setAccountIdState] = useState<string | null>(null);

  // Ao trocar de tenant (login/logout), recarrega a seleção salva daquele tenant
  // — nunca herda a seleção de um tenant anterior.
  useEffect(() => {
    setAccountIdState(tenantId ? localStorage.getItem(storageKey(tenantId)) : null);
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
    setAccountIdState(id);
    if (tenantId) localStorage.setItem(storageKey(tenantId), id);
  }

  const activeAccount = accounts.find((a) => a.id === accountId) ?? null;

  return (
    <AccountContext.Provider value={{ accountId, setAccountId, accounts, activeAccount }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount deve ser usado dentro de AccountProvider');
  return ctx;
}
