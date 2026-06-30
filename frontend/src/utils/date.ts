const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatMonthYear(month: number, year: number): string {
  return `${MONTHS_PT[month - 1]} ${year}`;
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

export function monthYearFromDate(iso: string): { month: number; year: number } {
  const parts = iso.slice(0, 10).split('-').map(Number);
  return { month: parts[1], year: parts[0] };
}
