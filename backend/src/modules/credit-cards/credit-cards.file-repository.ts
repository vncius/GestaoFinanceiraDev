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

  findAll() { return this.store.findAll(); }
  findById(id: string) { return this.store.findById(id); }
  create(data: CreditCard) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCard>) { return this.store.update(id, data); }
  delete(id: string) { return this.store.delete(id); }

  async findActive() {
    const all = await this.store.findAll();
    return all.filter((c) => c.active);
  }
}

export class CreditCardEntriesFileRepository
  implements CreditCardEntriesRepository
{
  private store = new JsonFileStore<CreditCardEntry>('credit-card-entries.json');

  findAll() { return this.store.findAll(); }
  findById(id: string) { return this.store.findById(id); }
  create(data: CreditCardEntry) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCardEntry>) { return this.store.update(id, data); }
  delete(id: string) { return this.store.delete(id); }

  async findByCardId(creditCardId: string) {
    const all = await this.store.findAll();
    return all.filter((e) => e.creditCardId === creditCardId);
  }

  async findActiveByCardId(creditCardId: string) {
    const all = await this.store.findAll();
    return all.filter((e) => e.creditCardId === creditCardId && e.active);
  }
}

export class CreditCardInstallmentsFileRepository
  implements CreditCardInstallmentsRepository
{
  private store = new JsonFileStore<CreditCardInstallment>(
    'credit-card-installments.json',
  );

  findAll() { return this.store.findAll(); }
  findById(id: string) { return this.store.findById(id); }
  create(data: CreditCardInstallment) { return this.store.create(data); }
  createMany(items: CreditCardInstallment[]) { return this.store.createMany(items); }
  update(id: string, data: Partial<CreditCardInstallment>) { return this.store.update(id, data); }
  delete(id: string) { return this.store.delete(id); }

  async findByEntryId(entryId: string) {
    const all = await this.store.findAll();
    return all.filter((i) => i.creditCardEntryId === entryId);
  }

  async findByMonth(month: number, year: number) {
    const all = await this.store.findAll();
    return all.filter((i) => i.month === month && i.year === year);
  }

  async findByCardAndMonth(
    creditCardId: string,
    month: number,
    year: number,
  ) {
    const entries = await new CreditCardEntriesFileRepository().findByCardId(
      creditCardId,
    );
    const entryIds = new Set(entries.map((e) => e.id));
    const all = await this.store.findAll();
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

  findAll() { return this.store.findAll(); }
  findById(id: string) { return this.store.findById(id); }
  create(data: CreditCardInvoice) { return this.store.create(data); }
  update(id: string, data: Partial<CreditCardInvoice>) { return this.store.update(id, data); }
  delete(id: string) { return this.store.delete(id); }

  async findByCardId(creditCardId: string) {
    const all = await this.store.findAll();
    return all.filter((inv) => inv.creditCardId === creditCardId);
  }

  async findByCardAndMonth(
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInvoice | null> {
    const all = await this.store.findAll();
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
