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

  findAll() {
    return this.store.findAll();
  }

  findById(id: string) {
    return this.store.findById(id);
  }

  create(data: FinancialTransaction) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<FinancialTransaction>) {
    return this.store.update(id, data);
  }

  delete(id: string) {
    return this.store.delete(id);
  }

  async findByMonth(month: number, year: number): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll();
    return all.filter((t) => {
      const [y, m] = t.expectedDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }

  async findByType(type: TransactionType): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll();
    return all.filter((t) => t.type === type);
  }

  async findByStatus(status: TransactionStatus): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll();
    return all.filter((t) => t.status === status);
  }

  async findByOrigin(
    originType: OriginType,
    originId: string,
  ): Promise<FinancialTransaction[]> {
    const all = await this.store.findAll();
    return all.filter(
      (t) => t.originType === originType && t.originId === originId,
    );
  }
}
