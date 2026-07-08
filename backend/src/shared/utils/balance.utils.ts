import { FinancialTransaction, TransactionStatus } from '../../modules/financial-transactions/financial-transactions.types';

interface AccountLike {
  id: string;
  initialBalance: number;
}

/**
 * Calcula o saldo de uma conta a partir do saldo inicial + lançamentos
 * confirmados (RECEIVED/PAID). Quando `beforeDate` é informado, considera
 * apenas lançamentos com `expectedDate` anterior ao mês daquela data —
 * usado para obter o saldo de "carry-over" de um mês anterior.
 *
 * Compara por string "YYYY-MM" (em vez de Date) para não sofrer o offset
 * UTC-vs-local: "2026-06-01T00:00Z" vira 31/05 21:00 em UTC-3, então uma
 * comparação por Date incluiria erroneamente lançamentos de junho no
 * carry-over de maio.
 */
export function calcAccountBalance(
  account: AccountLike,
  transactions: FinancialTransaction[],
  beforeDate?: Date,
): number {
  let balance = account.initialBalance;

  const beforeYM = beforeDate
    ? `${beforeDate.getFullYear()}-${String(beforeDate.getMonth() + 1).padStart(2, '0')}`
    : null;

  const confirmed = transactions.filter((t) => {
    const isConfirmed =
      t.status === TransactionStatus.RECEIVED || t.status === TransactionStatus.PAID;
    if (!isConfirmed) return false;
    if (beforeYM) {
      // Usa expectedDate para todos os tipos, consistente com como
      // paidPayments/receivedIncome contam os meses (ambos usam
      // expectedDate/expectedPaymentDate). Garante que
      // initialBalance_junho == realizedBalance_maio.
      return t.expectedDate.slice(0, 7) < beforeYM;
    }
    return true;
  });

  balance += confirmed
    .filter((t) => t.targetAccountId === account.id)
    .reduce((s, t) => s + t.amount, 0);

  balance -= confirmed
    .filter((t) => t.sourceAccountId === account.id)
    .reduce((s, t) => s + t.amount, 0);

  return balance;
}
