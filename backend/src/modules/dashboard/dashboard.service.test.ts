import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { DashboardService } from './dashboard.service';
import { DueType } from './dashboard.types';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import {
  FinancialTransaction,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { Account } from '../accounts/accounts.types';

const TENANT_ID = 'test-tenant-1';

class Repo<T extends { id: string; tenantId: string }> {
  items: T[] = [];
  async findAll(tenantId: string) { return this.items.filter((i) => i.tenantId === tenantId); }
  async findActive(tenantId: string) { return this.items.filter((i) => i.tenantId === tenantId); }
  async findById(id: string, tenantId: string) { return this.items.find((i) => i.id === id && i.tenantId === tenantId) ?? null; }
  async create(d: T) { this.items.push(d); return d; }
  async createMany(d: T[]) { this.items.push(...d); return d; }
  async update(id: string, d: Partial<T>) { const i = this.items.findIndex((x) => x.id === id); this.items[i] = { ...this.items[i], ...d }; return this.items[i]; }
}

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00.000Z`;
}

function build() {
  const transactions = new Repo<FinancialTransaction>();
  const accounts = new Repo<Account>();
  const cashFlow = new CashFlowService(transactions as never, accounts as never);
  const empty = new Repo<never>();
  const service = new DashboardService(cashFlow, empty as never, empty as never, empty as never);
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(), tenantId: TENANT_ID, name: 'Conta', accountTypeId: null, initialBalance: 0,
    initialBalanceDate: now, active: true, autoReserveEnabled: false, autoReservePercentage: 0,
    autoReserveTargetAccountId: null, createdAt: now, updatedAt: now,
  };
  accounts.items.push(account);
  const tx = (type: TransactionType, description: string, days: number, status = TransactionStatus.PENDING) =>
    transactions.items.push({
      id: randomUUID(), tenantId: TENANT_ID, type, description, categoryId: null, amount: 1000,
      expectedDate: iso(days), actualDate: null, status,
      sourceAccountId: type === TransactionType.INCOME ? null : account.id,
      targetAccountId: type === TransactionType.INCOME ? account.id : null,
      originType: null, originId: null, notes: null, recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null, recurringActive: true, transferGroupId: null, createdAt: now, updatedAt: now,
    } as FinancialTransaction);
  return { service, tx };
}

describe('DashboardService — próximos vencimentos', () => {
  it('traz entradas a receber, atrasados de qualquer data primeiro, e ignora o que já foi pago ou está longe', async () => {
    const { service, tx } = build();
    tx(TransactionType.PAYMENT, 'Aluguel atrasado', -40);
    tx(TransactionType.PAYMENT, 'Internet', 3);
    tx(TransactionType.INCOME, 'Salário', 5);
    tx(TransactionType.EXTRA_EXPENSE, 'Pago', 2, TransactionStatus.PAID);
    tx(TransactionType.PAYMENT, 'Daqui a 2 meses', 60);

    const { upcomingDues } = await service.getDashboard(TENANT_ID, { upcomingDays: 15, evolutionMonths: 1 });

    expect(upcomingDues.map((d) => d.description)).toEqual(['Aluguel atrasado', 'Internet', 'Salário']);
    expect(upcomingDues.map((d) => d.overdue)).toEqual([true, false, false]);
    expect(upcomingDues[2].type).toBe(DueType.INCOME);
  });
});
