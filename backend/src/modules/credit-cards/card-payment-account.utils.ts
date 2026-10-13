// Todo cartão pertence a uma conta pagadora (D5 do plano de simplificação de
// UX): é ela que leva a fatura em aberto para o fluxo de caixa de alguma
// conta. Sem conta pagadora válida, a fatura só aparecia depois de paga.

interface AccountLike {
  id: string;
  name: string;
  active: boolean;
}

interface CardLike {
  defaultPaymentAccountId: string | null;
}

// Conta usada quando o cartão não tem uma pagadora válida: a primeira conta
// ativa em ordem alfabética — mesma ordem das combos do frontend, então é a
// mesma conta que o formulário de cartão já sugere por padrão.
export function fallbackPaymentAccountId(accounts: AccountLike[]): string | null {
  const active = accounts
    .filter((a) => a.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return active[0]?.id ?? null;
}

// Pagadora ausente, ou apontando para uma conta que não existe mais ou foi
// desativada (fluxo de conta inativa não aparece em lugar nenhum).
export function hasValidPaymentAccount(card: CardLike, accounts: AccountLike[]): boolean {
  return !!card.defaultPaymentAccountId &&
    accounts.some((a) => a.id === card.defaultPaymentAccountId && a.active);
}

// Devolve os cartões com pagadora válida, preenchendo a fallback onde faltar.
// Cartões sem conta ativa nenhuma no tenant ficam como estão.
export function withPaymentAccount<T extends CardLike>(cards: T[], accounts: AccountLike[]): T[] {
  const fallback = fallbackPaymentAccountId(accounts);
  if (!fallback) return cards;
  return cards.map((card) =>
    hasValidPaymentAccount(card, accounts) ? card : { ...card, defaultPaymentAccountId: fallback },
  );
}
