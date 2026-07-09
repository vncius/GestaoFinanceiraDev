import { JsonFileStore } from '../../shared/persistence/json-file-store';
import { ReceivablesRepository } from './receivables.repository';
import { Receivable, ReceivableStatus } from './receivables.types';

export class ReceivablesFileRepository implements ReceivablesRepository {
  private store = new JsonFileStore<Receivable>('receivables.json');

  findAll(tenantId: string) {
    return this.store.findAll(tenantId);
  }

  findById(id: string, tenantId: string) {
    return this.store.findById(id, tenantId);
  }

  create(data: Receivable) {
    return this.store.create(data);
  }

  update(id: string, data: Partial<Receivable>, tenantId: string) {
    return this.store.update(id, data, tenantId);
  }

  delete(id: string, tenantId: string) {
    return this.store.delete(id, tenantId);
  }

  replaceAll(tenantId: string, items: Receivable[]) {
    return this.store.replaceAllForTenant(tenantId, items);
  }

  async findByMonth(tenantId: string, month: number, year: number): Promise<Receivable[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter((r) => {
      const [y, m] = r.expectedPaymentDate.slice(0, 10).split('-').map(Number);
      return m === month && y === year;
    });
  }

  async findByStatus(tenantId: string, status: ReceivableStatus): Promise<Receivable[]> {
    const all = await this.store.findAll(tenantId);
    return all.filter((r) => r.status === status);
  }
}
