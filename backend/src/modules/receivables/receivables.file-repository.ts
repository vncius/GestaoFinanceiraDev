import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { ReceivablesRepository } from './receivables.repository';
import { Receivable, ReceivableStatus } from './receivables.types';

export class ReceivablesFileRepository implements ReceivablesRepository {
  private store = new JsonFileStore<Receivable>('receivables.json');

  findAll() {
    return this.store.findAll();
  }

  findById(id: string) {
    return this.store.findById(id);
  }

  create(data: Receivable) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Receivable>) {
    return this.store.update(id, data);
  }

  delete(id: string) {
    return this.store.delete(id);
  }

  async findByMonth(month: number, year: number): Promise<Receivable[]> {
    const all = await this.store.findAll();
    return all.filter((r) => {
      const [y, m] = r.expectedPaymentDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }

  async findByStatus(status: ReceivableStatus): Promise<Receivable[]> {
    const all = await this.store.findAll();
    return all.filter((r) => r.status === status);
  }
}
