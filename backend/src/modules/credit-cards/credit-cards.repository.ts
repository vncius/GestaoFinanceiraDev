import { BaseRepository } from '../../shared/persistence/repository.types';
import {
  CreditCard,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
} from './credit-cards.types';

export interface CreditCardsRepository extends BaseRepository<CreditCard> {
  findActive(): Promise<CreditCard[]>;
}

export interface CreditCardEntriesRepository
  extends BaseRepository<CreditCardEntry> {
  findByCardId(creditCardId: string): Promise<CreditCardEntry[]>;
  findActiveByCardId(creditCardId: string): Promise<CreditCardEntry[]>;
}

export interface CreditCardInstallmentsRepository
  extends BaseRepository<CreditCardInstallment> {
  findByEntryId(entryId: string): Promise<CreditCardInstallment[]>;
  findByMonth(month: number, year: number): Promise<CreditCardInstallment[]>;
  findByCardAndMonth(
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInstallment[]>;
}

export interface CreditCardInvoicesRepository
  extends BaseRepository<CreditCardInvoice> {
  findByCardId(creditCardId: string): Promise<CreditCardInvoice[]>;
  findByCardAndMonth(
    creditCardId: string,
    month: number,
    year: number,
  ): Promise<CreditCardInvoice | null>;
}
