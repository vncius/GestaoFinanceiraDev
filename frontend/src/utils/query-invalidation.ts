import { QueryClient } from '@tanstack/react-query';

// Queries cujo conteúdo é CALCULADO no backend a partir de contas, categorias,
// cartões e lançamentos. Qualquer mutação em um desses cadastros muda o que
// elas retornam, mesmo sem tocar diretamente nos lançamentos:
//   - `cashFlow` lê `initialBalance` e a reserva automática da conta
//     (cash-flow.service.ts:283 e :446) e resolve nomes de categoria/cartão;
//   - `dashboard` agrega por categoria (dashboard.service.ts:326), soma
//     faturas de cartão (:110) e usa `autoReserveTargetAccountId` (:155);
//   - `creditCards` carrega os cartões e suas faturas.
//
// Sempre por PREFIXO: essas chaves carregam accountId/month/year e o cache
// guarda uma entrada por combinação. Invalidar a chave completa da referência
// ativa deixa os demais meses/contas desatualizados até um F5.
export function invalidateDerivedData(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['cashFlow'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['creditCards'] });
}
