import { FinancialTransaction } from '../financial-transactions/financial-transactions.types';

export interface TransferPair {
  transferGroupId: string;
  outgoing: FinancialTransaction;
  incoming: FinancialTransaction;
}
