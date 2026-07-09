import { describe, expect, it } from 'vitest';
import { calcAccountBalance } from './balance.utils';
import { RecurrenceType, TransactionStatus, TransactionType } from '../../modules/financial-transactions/financial-transactions.types';
import { FinancialTransaction } from '../../modules/financial-transactions/financial-transactions.types';

const ACCOUNT = { id: 'acc-1', initialBalance: 10000 };

function tx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: 'tx',
    tenantId: 'tenant-1',
    type: TransactionType.PAYMENT,
    description: 'test',
    categoryId: null,
    amount: 1000,
    expectedDate: '2026-03-10',
    actualDate: null,
    status: TransactionStatus.PAID,
    sourceAccountId: null,
    targetAccountId: null,
    originType: null,
    originId: null,
    notes: null,
    recurrence: RecurrenceType.UNIQUE,
    recurringGroupId: null,
    recurringActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calcAccountBalance', () => {
  it('adds inflows and subtracts outflows for the account on top of initialBalance', () => {
    const transactions = [
      tx({ targetAccountId: ACCOUNT.id, amount: 5000 }),
      tx({ sourceAccountId: ACCOUNT.id, amount: 2000 }),
    ];
    expect(calcAccountBalance(ACCOUNT, transactions)).toBe(10000 + 5000 - 2000);
  });

  it('ignores transactions that are not RECEIVED/PAID', () => {
    const transactions = [
      tx({ targetAccountId: ACCOUNT.id, amount: 5000, status: TransactionStatus.PENDING }),
    ];
    expect(calcAccountBalance(ACCOUNT, transactions)).toBe(10000);
  });

  it('ignores transactions for a different account', () => {
    const transactions = [tx({ targetAccountId: 'other-account', amount: 5000 })];
    expect(calcAccountBalance(ACCOUNT, transactions)).toBe(10000);
  });

  it('with beforeDate, only counts transactions from strictly earlier months (by expectedDate)', () => {
    const transactions = [
      tx({ targetAccountId: ACCOUNT.id, amount: 3000, expectedDate: '2026-02-28' }),
      tx({ targetAccountId: ACCOUNT.id, amount: 9000, expectedDate: '2026-03-01' }),
    ];
    // beforeDate = start of March -> only the February transaction counts
    expect(calcAccountBalance(ACCOUNT, transactions, new Date(2026, 2, 1))).toBe(10000 + 3000);
  });

  it('does not shift a month boundary due to UTC offset in expectedDate', () => {
    const transactions = [
      tx({ targetAccountId: ACCOUNT.id, amount: 3000, expectedDate: '2026-06-01T00:00:00.000Z' }),
    ];
    // beforeDate = start of June -> the June-1 transaction must NOT be
    // treated as May just because new Date(iso) would shift it in UTC-3.
    expect(calcAccountBalance(ACCOUNT, transactions, new Date(2026, 5, 1))).toBe(10000);
  });
});
