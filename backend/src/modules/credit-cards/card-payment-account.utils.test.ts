import { describe, expect, it } from 'vitest';
import { fallbackPaymentAccountId, hasValidPaymentAccount, withPaymentAccount } from './card-payment-account.utils';

const accounts = [
  { id: 'pj', name: 'PJ', active: true },
  { id: 'antiga', name: 'Antiga', active: false },
  { id: 'banco', name: 'banco do bairro', active: true },
];

describe('card-payment-account.utils', () => {
  it('fallback é a primeira conta ativa em ordem alfabética, ignorando caixa e inativas', () => {
    expect(fallbackPaymentAccountId(accounts)).toBe('banco');
    expect(fallbackPaymentAccountId([{ id: 'x', name: 'X', active: false }])).toBeNull();
  });

  it('pagadora válida precisa existir e estar ativa', () => {
    expect(hasValidPaymentAccount({ defaultPaymentAccountId: 'pj' }, accounts)).toBe(true);
    expect(hasValidPaymentAccount({ defaultPaymentAccountId: null }, accounts)).toBe(false);
    expect(hasValidPaymentAccount({ defaultPaymentAccountId: 'antiga' }, accounts)).toBe(false);
    expect(hasValidPaymentAccount({ defaultPaymentAccountId: 'sumiu' }, accounts)).toBe(false);
  });

  it('withPaymentAccount só troca a pagadora de quem não tem uma válida', () => {
    const cards = [
      { id: 'a', defaultPaymentAccountId: 'pj' },
      { id: 'b', defaultPaymentAccountId: null },
      { id: 'c', defaultPaymentAccountId: 'antiga' },
    ];
    expect(withPaymentAccount(cards, accounts).map((c) => c.defaultPaymentAccountId)).toEqual(['pj', 'banco', 'banco']);
  });

  it('sem conta ativa no tenant, devolve os cartões como estão', () => {
    const cards = [{ defaultPaymentAccountId: null }];
    expect(withPaymentAccount(cards, [])).toBe(cards);
  });
});
