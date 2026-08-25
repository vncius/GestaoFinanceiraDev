import { MongoStore } from '../../shared/persistence/mongo-store';
import { FinancialTransactionsRepository } from './financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  TransactionStatus,
  TransactionType,
} from './financial-transactions.types';

export class FinancialTransactionsMongoRepository
  implements FinancialTransactionsRepository
{
  // Índices por conta: getCashFlow (E5) e calcAccountBalance filtram por
  // sourceAccountId/targetAccountId em cada requisição.
  private store = new MongoStore<FinancialTransaction>('financial_transactions', [
    { tenantId: 1, sourceAccountId: 1 },
    { tenantId: 1, targetAccountId: 1 },
  ]);

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: FinancialTransaction) {
    return this.store.create(data);
  }

  createMany(items: FinancialTransaction[]) {
    return this.store.createMany(items);
  }

  update(id: string, data: Partial<FinancialTransaction>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
  }

  replaceAll(tenantId: string, items: FinancialTransaction[]) {
    return this.store.replaceAllForTenant(tenantId, items);
  }

  async findByMonth(tenantId: string, month: number, year: number): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter((t) => {
      const [y, m] = t.expectedDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }

  async findByType(tenantId: string, type: TransactionType): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter((t) => t.type === type);
  }

  async findByStatus(tenantId: string, status: TransactionStatus): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter((t) => t.status === status);
  }

  async findByOrigin(
    tenantId: string,
    originType: OriginType,
    originId: string,
  ): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter(
      (t) => t.originType === originType && t.originId === originId,
    );
  }
}
