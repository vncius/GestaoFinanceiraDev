import { BaseRepository } from '../../shared/persistence/repository.types';
import {
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
  OriginType,
} from './financial-transactions.types';

export interface FinancialTransactionsRepository
  extends BaseRepository<FinancialTransaction> {
  createMany(items: FinancialTransaction[]): Promise<FinancialTransaction[]>;
  findByMonth(tenantId: string, month: number, year: number): Promise<FinancialTransaction[]>;
  findByType(tenantId: string, type: TransactionType): Promise<FinancialTransaction[]>;
  findByStatus(tenantId: string, status: TransactionStatus): Promise<FinancialTransaction[]>;
  findByOrigin(
    tenantId: string,
    originType: OriginType,
    originId: string,
  ): Promise<FinancialTransaction[]>;
  findByTransferGroup(tenantId: string, transferGroupId: string): Promise<FinancialTransaction[]>;
}
