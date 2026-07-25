export type SuggestedEntryType = 'CASH' | 'INSTALLMENT' | 'REFUND';

export interface InstallmentInfo {
  current: number;
  total: number;
}

// Linha do preview retornada por parseInvoiceOfx — nada aqui é persistido
// ainda; o usuário revisa/edita no frontend e só então chama confirmImport.
export interface InvoiceImportPreviewEntry {
  key: string;
  date: string; // ISO (yyyy-MM-dd)
  description: string;
  amountCents: number; // com sinal: negativo = despesa, positivo = crédito/estorno
  suggestedEntryType: SuggestedEntryType;
  installmentInfo: InstallmentInfo | null;
  suggestedCategoryId: string | null;
  possibleDuplicate: boolean;
  // id do lançamento ativo já existente com o mesmo externalRef (FITID),
  // quando possibleDuplicate veio de uma duplicata forte — usado para
  // oferecer "sobrescrever" em vez de só bloquear/ignorar a linha.
  existingEntryId: string | null;
  possiblePreviousInvoicePayment: boolean;
  externalRef: string | null;
  targetMonth: number;
  targetYear: number;
}

// Resultado bruto do parser OFX, antes de aplicar dedup/categorização/mês da fatura.
export interface ParsedOfxCardTransaction {
  date: string;
  description: string;
  amountCents: number;
  externalRef: string | null;
  installmentInfo: InstallmentInfo | null;
  possiblePreviousInvoicePayment: boolean;
}
