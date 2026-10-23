import { addMonths, monthYearOf } from '../../shared/utils/date.utils';

// Funções puras do "Imposto a pagar" sobre NF (docs/plano-imposto-nf.md).
// Sem acesso a banco: o recálculo em si vive no CashFlowService.

export const DEFAULT_INVOICE_TAX_DUE_DAY = 20;

export interface Competence {
  year: number;
  month: number; // 1-12
}

/** Mês de competência de uma NF = mês da data de emissão (sem passar por Date). */
export function competenceOf(issueDate: string): Competence {
  const { year, month } = monthYearOf(issueDate);
  return { year, month };
}

/** Imposto de uma NF em centavos: `round(valor × alíquota)`, alíquota em centésimos de ponto percentual. */
export function calcInvoiceTax(amount: number, rateBps: number): number {
  return Math.round((amount * rateBps) / 10_000);
}

/** Chave da despesa derivada: uma por conta da NF + mês de competência. */
export function invoiceTaxOriginId(accountId: string, competence: Competence): string {
  return `${accountId}:${competence.year}-${String(competence.month).padStart(2, '0')}`;
}

/** Inverso de `invoiceTaxOriginId`; null quando o texto não tem o formato esperado. */
export function parseInvoiceTaxOriginId(originId: string): { accountId: string; competence: Competence } | null {
  const match = /^(.+):(\d{4})-(0[1-9]|1[0-2])$/.exec(originId);
  if (!match) return null;
  return { accountId: match[1], competence: { year: Number(match[2]), month: Number(match[3]) } };
}

/**
 * Vencimento padrão do imposto: `dueDay` do mês seguinte à competência, com
 * clamp para o último dia de meses curtos. Devolve ISO à meia-noite UTC.
 */
export function invoiceTaxDueDate(competence: Competence, dueDay: number = DEFAULT_INVOICE_TAX_DUE_DAY): string {
  const next = addMonths(competence.month, competence.year, 1, dueDay);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.year}-${pad(next.month)}-${pad(next.day)}T00:00:00.000Z`;
}
