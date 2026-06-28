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
