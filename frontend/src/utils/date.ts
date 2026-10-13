import i18n from '../i18n';

const INTL_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

// "Outubro 2026" / "October 2026" / "Octubre 2026" — no idioma ativo da app.
export function formatMonthYear(month: number, year: number, language: string = i18n.language ?? 'pt'): string {
  const locale = INTL_LOCALE[language] ?? language;
  const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export function toInputDate(iso: string): string {
  return iso.slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function firstDayOfMonthISO(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function lastDayOfMonthISO(month: number, year: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function defaultEntryDateISO(month: number, year: number): string {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  if (month === currentMonth && year === currentYear) return todayISO();
  const isFuture = year > currentYear || (year === currentYear && month > currentMonth);
  return isFuture ? firstDayOfMonthISO(month, year) : lastDayOfMonthISO(month, year);
}

export function monthYearFromDate(iso: string): { month: number; year: number } {
  const parts = iso.slice(0, 10).split('-').map(Number);
  return { month: parts[1], year: parts[0] };
}

// "out/26" — mês abreviado no idioma informado + ano com dois dígitos.
export function formatMonthYearShort(month: number, year: number, locale = 'pt-BR'): string {
  const name = new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
  return `${name}/${String(year).slice(2)}`;
}
