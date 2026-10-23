import { describe, expect, it } from 'vitest';
import { importBackupSchema } from './backup.schemas';
import { neutralizeFormula } from './backup.service';

function bundle(data: Record<string, unknown[]> = {}) {
  return {
    confirm: true,
    bundle: {
      version: 2,
      exportedAt: '2026-10-14T00:00:00.000Z',
      data: {
        accounts: [],
        categories: [],
        settings: [],
        financialTransactions: [],
        creditCards: [],
        creditCardEntries: [],
        creditCardInstallments: [],
        creditCardInvoices: [],
        ...data,
      },
    },
  };
}

const transaction = {
  id: 't1',
  tenantId: 'outro-tenant',
  type: 'PAYMENT',
  description: 'Aluguel',
  categoryId: null,
  amount: 150000,
  expectedDate: '2026-10-05',
  actualDate: null,
  status: 'PENDING',
  sourceAccountId: 'a1',
  targetAccountId: null,
  originType: null,
  originId: null,
  transferGroupId: null,
  notes: null,
  recurrence: 'UNIQUE',
  recurringGroupId: null,
  recurringActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('importBackupSchema', () => {
  it('aceita um export normal', () => {
    const parsed = importBackupSchema.parse(bundle({ financialTransactions: [transaction] }));
    expect(parsed.bundle.data.financialTransactions[0]).toMatchObject({ id: 't1', amount: 150000 });
  });

  it('aceita backup antigo com campos a menos e campo legado simples', () => {
    const parsed = importBackupSchema.parse(
      bundle({ accounts: [{ id: 'a1', name: 'Conta', type: 'MAIN', isDefault: true }] }),
    );
    expect(parsed.bundle.data.accounts[0]).toMatchObject({ id: 'a1', type: 'MAIN', isDefault: true });
  });

  it('aceita os campos de imposto sobre NF e recusa alíquota fora da faixa', () => {
    const parsed = importBackupSchema.parse(
      bundle({
        accounts: [{ id: 'a1', invoiceTaxEnabled: true, invoiceTaxDefaultRateBps: 600, invoiceTaxDueDay: 20 }],
        financialTransactions: [{ ...transaction, type: 'INCOME', taxRateBps: 600, issueDate: '2026-10-03' }],
      }),
    );
    expect(parsed.bundle.data.accounts[0]).toMatchObject({ invoiceTaxDefaultRateBps: 600 });
    expect(parsed.bundle.data.financialTransactions[0]).toMatchObject({ taxRateBps: 600, issueDate: '2026-10-03' });
    expect(() =>
      importBackupSchema.parse(bundle({ financialTransactions: [{ ...transaction, taxRateBps: 20000 }] })),
    ).toThrow();
  });

  it('descarta _id vindo do arquivo', () => {
    const parsed = importBackupSchema.parse(bundle({ categories: [{ id: 'c1', name: 'X', _id: 'abc' }] }));
    expect(parsed.bundle.data.categories[0]).not.toHaveProperty('_id');
  });

  it('recusa objeto aninhado em campo desconhecido (porta de entrada de operadores)', () => {
    expect(() =>
      importBackupSchema.parse(bundle({ categories: [{ id: 'c1', extra: { $gt: '' } }] })),
    ).toThrow();
  });

  it('recusa tipo errado em campo conhecido', () => {
    expect(() =>
      importBackupSchema.parse(bundle({ financialTransactions: [{ ...transaction, amount: { $gt: 0 } }] })),
    ).toThrow();
    expect(() =>
      importBackupSchema.parse(bundle({ financialTransactions: [{ ...transaction, amount: 10.5 }] })),
    ).toThrow();
  });

  it('recusa texto gigante', () => {
    expect(() =>
      importBackupSchema.parse(bundle({ financialTransactions: [{ ...transaction, description: 'x'.repeat(5001) }] })),
    ).toThrow();
  });

  it('exige id', () => {
    expect(() => importBackupSchema.parse(bundle({ categories: [{ name: 'Sem id' }] }))).toThrow();
  });
});

describe('neutralizeFormula', () => {
  it.each(['=1+1', '+SOMA(A1)', '-2+3', '@cmd', '\tx'])('neutraliza %j', (value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`);
  });

  it('não mexe em texto comum', () => {
    expect(neutralizeFormula('Mercado')).toBe('Mercado');
    expect(neutralizeFormula('')).toBe('');
  });
});
