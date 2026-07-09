import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { FinancialTransactionsRepository } from './financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  TransactionStatus,
  TransactionType,
} from './financial-transactions.types';

export class FinancialTransactionsFileRepository
  implements FinancialTransactionsRepository
{
  private store = new JsonFileStore<FinancialTransaction>(
    'financial-transactions.json',
  );

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: FinancialTransaction) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<FinancialTransaction>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
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
