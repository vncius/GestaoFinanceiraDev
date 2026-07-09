import { BaseRepository } from '../../shared/persistence/repository.types';
import { Receivable, ReceivableStatus } from './receivables.types';

export interface ReceivablesRepository extends BaseRepository<Receivable> {
  findByMonth(tenantId: string, month: number, year: number): Promise<Receivable[]>;
  findByStatus(tenantId: string, status: ReceivableStatus): Promise<Receivable[]>;
}
