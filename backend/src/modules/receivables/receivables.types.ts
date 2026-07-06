import { RecurrenceType } from '../../shared/types/recurrence.types';

export { RecurrenceType };

export enum ReceivableStatus {
  EXPECTED = 'EXPECTED',
  RECEIVED = 'RECEIVED',
  CANCELED = 'CANCELED',
}

export interface Receivable {
  id: string;
  description: string;
  expectedPaymentDate: string;        // ISO
  actualPaymentDate: string | null;   // ISO — preenchido ao receber
  grossAmount: number;                // centavos
  separateReservePercentage: boolean;
  reservePercentageApplied: number;   // ex: 30
  reserveAmount: number;              // centavos
  netAmount: number;                  // centavos
  status: ReceivableStatus;
  incomeCategoryId: string;
  notes: string | null;
  recurrence: RecurrenceType;
  // id do registro raiz da série (== o próprio id quando é o primeiro); null quando UNIQUE
  recurringGroupId: string | null;
  // false quando o usuário encerrou a série ("esta e as futuras"); só relevante para FIXED
  recurringActive: boolean;
  // campos opcionais de NF/projeto
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceCode: string | null;
  invoiceLink: string | null;
  invoiceIssueDate: string | null;
  competence: string | null;
  workedHours: number | null;
  hourlyRate: number | null;          // centavos por hora
  targetAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}
