/** Retorna a data atual em formato ISO. */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Converte Date ou string para ISO string. */
export function toISO(date: Date | string): string {
  return typeof date === 'string' ? new Date(date).toISOString() : date.toISOString();
}

/** Retorna apenas a parte da data (YYYY-MM-DD). */
export function toDateOnly(date: Date | string): string {
  return toISO(date).split('T')[0];
}

/** Parseia uma string de data para Date. */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/** Verifica se uma data já passou. */
export function isOverdue(dateString: string): boolean {
  return new Date(dateString) < new Date();
}

/** Verifica se uma data está dentro de N dias a partir de hoje. */
export function isWithinDays(dateString: string, days: number): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return date >= now && date <= limit;
}

/** Soma `count` meses a partir de month/year (1-12), preservando o mesmo dia (com clamp). */
export function addMonths(
  month: number,
  year: number,
  count: number,
  day = 1,
): { month: number; year: number; day: number } {
  const d = new Date(year, month - 1 + count, 1);
  const targetMonth = d.getMonth() + 1;
  const targetYear = d.getFullYear();
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  return { month: targetMonth, year: targetYear, day: Math.min(day, lastDay) };
}

/** Chave numérica comparável para ordenar/comparar mês+ano. */
export function monthKey(month: number, year: number): number {
  return year * 12 + month;
}

/**
 * Extrai ano/mês/dia de uma data ISO usando apenas a parte YYYY-MM-DD
 * (evita o bug de offset UTC-vs-local ao usar `new Date(iso).getMonth()`).
 */
export function monthYearOf(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return { year, month, day };
}
