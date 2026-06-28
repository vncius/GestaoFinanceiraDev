import { BaseRepository } from '../../shared/persistence/repository.types';
import {
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
  OriginType,
} from './financial-transactions.types';

export interface FinancialTransactionsRepository
  extends BaseRepository<FinancialTransaction> {
  findByMonth(month: number, year: number): Promise<FinancialTransaction[]>;
  findByType(type: TransactionType): Promise<FinancialTransaction[]>;
  findByStatus(status: TransactionStatus): Promise<FinancialTransaction[]>;
  findByOrigin(
    originType: OriginType,
    originId: string,
  ): Promise<FinancialTransaction[]>;
}
