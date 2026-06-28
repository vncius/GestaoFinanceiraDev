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
  // campos opcionais de NF/projeto
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceCode: string | null;
  invoiceLink: string | null;
  invoiceIssueDate: string | null;
  competence: string | null;
  workedHours: number | null;
  hourlyRate: number | null;          // centavos por hora
  createdAt: string;
  updatedAt: string;
}
