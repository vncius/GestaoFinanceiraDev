import { BaseRepository } from '../../shared/persistence/repository.types';
import { Receivable, ReceivableStatus } from './receivables.types';

export interface ReceivablesRepository extends BaseRepository<Receivable> {
  findByMonth(month: number, year: number): Promise<Receivable[]>;
  findByStatus(status: ReceivableStatus): Promise<Receivable[]>;
}
