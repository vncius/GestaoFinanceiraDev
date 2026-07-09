import { JsonFileStore } from '../../shared/persistence/json-file-store';
import {
  CreditCardsRepository,
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from './credit-cards.repository';
import {
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
} from './credit-cards.types';

export class CreditCardsFileRepository implements CreditCardsRepository {
  private store = new JsonFileStore<CreditCard>('credit-cards.json');

  findAll(tenantId: string) { return this.store.findAll(tenantId); }
  findById(id: string, tenantId: string) { return this.store.findById(id, tenantId); }
  create(data: CreditCard) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCard>, tenantId: string) { return this.store.update(id, data, tenantId); }
  delete(id: string, tenantId: string) { return this.store.delete(id, tenantId); }
  replaceAll(tenantId: string, items: CreditCard[]) { return this.store.replaceAllForTenant(tenantId, items); }

  async findActive(tenantId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((c) => c.active);
  }
}

export class CreditCardEntriesFileRepository
  implements CreditCardEntriesRepository
{
  private store = new JsonFileStore<CreditCardEntry>('credit-card-entries.json');

  findAll(tenantId: string) { return this.store.findAll(tenantId); }
  findById(id: string, tenantId: string) { return this.store.findById(id, tenantId); }
  create(data: CreditCardEntry) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCardEntry>, tenantId: string) { return this.store.update(id, data, tenantId); }
  delete(id: string, tenantId: string) { return this.store.delete(id, tenantId); }
  replaceAll(tenantId: string, items: CreditCardEntry[]) { return this.store.replaceAllForTenant(tenantId, items); }

  async findByCardId(tenantId: string, creditCardId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((e) => e.creditCardId === creditCardId);
  }

  async findActiveByCardId(tenantId: string, creditCardId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((e) => e.creditCardId === creditCardId && e.active);
  }
}

export class CreditCardInstallmentsFileRepository
  implements CreditCardInstallmentsRepository
{
  private store = new JsonFileStore<CreditCardInstallment>(
    'credit-card-installments.json',
  );

  findAll(tenantId: string) { return this.store.findAll(tenantId); }
  findById(id: string, tenantId: string) { return this.store.findById(id, tenantId); }
  create(data: CreditCardInstallment) { return this.store.create(data); }
  createMany(items: CreditCardInstallment[]) { return this.store.createMany(items); }
  update(id: string, data: Partial<CreditCardInstallment>, tenantId: string) { return this.store.update(id, data, tenantId); }
  delete(id: string, tenantId: string) { return this.store.delete(id, tenantId); }
  replaceAll(tenantId: string, items: CreditCardInstallment[]) { return this.store.replaceAllForTenant(tenantId, items); }

  async findByEntryId(tenantId: string, entryId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((i) => i.creditCardEntryId === entryId);
  }

  async findByMonth(tenantId: string, month: number, year: number) {
    const all = await this.store.findAll(tenantId);
    return all.filter((i) => i.month === month && i.year === year);
  }

  async findByCardAndMonth(
    tenantId: string,
    creditCardId: string,
    month: number,
    year: number,
  ) {
    const entries = await new CreditCardEntriesFileRepository().findByCardId(
      tenantId,
      creditCardId,
    );
    const entryIds = new Set(entries.map((e) => e.id));
    const all = await this.store.findAll(tenantId);
    return all.filter(
      (i) =>
        entryIds.has(i.creditCardEntryId) &&
        i.month === month &&
        i.year === year,
    );
  }
}

export class CreditCardInvoicesFileRepository
  implements CreditCardInvoicesRepository
{
  private store = new JsonFileStore<CreditCardInvoice>(
    'credit-card-invoices.json',
  );

  findAll(tenantId: string) { return this.store.findAll(tenantId); }
  findById(id: string, tenantId: string) { return this.store.findById(id, tenantId); }
  create(data: CreditCardInvoice) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCardInvoice>, tenantId: string) { return this.store.update(id, data, tenantId); }
  delete(id: string, tenantId: string) { return this.store.delete(id, tenantId); }
  replaceAll(tenantId: string, items: CreditCardInvoice[]) { return this.store.replaceAllForTenant(tenantId, items); }

  async findByCardId(tenantId: string, creditCardId: string) {
    const all = await this.store.findAll(tenantId);
    return all.filter((inv) => inv.creditCardId === creditCardId);
  }

  async findByCardAndMonth(
    tenantId: string,
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInvoice | null> {
    const all = await this.store.findAll(tenantId);
    return (
      all.find(
        (inv) =>
          inv.creditCardId === creditCardId &&
          inv.month === month &&
          inv.year === year,
      ) ?? null
    );
  }
}
