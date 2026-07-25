import { BaseRepository } from '../../shared/persistence/repository.types';
import {
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
} from './credit-cards.types';

export interface CreditCardsRepository extends BaseRepository<CreditCard> {
  findActive(tenantId: string): Promise<CreditCard[]>;
}

export interface CreditCardEntriesRepository
  extends BaseRepository<CreditCardEntry> {
  findByCardId(tenantId: string, creditCardId: string): Promise<CreditCardEntry[]>;
  findActiveByCardId(tenantId: string, creditCardId: string): Promise<CreditCardEntry[]>;
}

export interface CreditCardInstallmentsRepository
  extends BaseRepository<CreditCardInstallment> {
  findByEntryId(tenantId: string, entryId: string): Promise<CreditCardInstallment[]>;
  findByMonth(tenantId: string, month: number, year: number): Promise<CreditCardInstallment[]>;
  findByCardAndMonth(
    tenantId: string,
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInstallment[]>;
  findByInvoiceId(tenantId: string, invoiceId: string): Promise<CreditCardInstallment[]>;
  createMany(items: CreditCardInstallment[]): Promise<CreditCardInstallment[]>;
}

export interface CreditCardInvoicesRepository
  extends BaseRepository<CreditCardInvoice> {
  findByCardId(tenantId: string, creditCardId: string): Promise<CreditCardInvoice[]>;
  findByCardAndMonth(
    tenantId: string,
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInvoice | null>;
}
