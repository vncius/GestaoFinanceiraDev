const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

export function formatCurrency(cents: number): string {
  return BRL.format(cents / 100);
}

export function centsToFloat(cents: number): number {
  return cents / 100;
}

export function floatToCents(value: number): number {
  return Math.round(value * 100);
}

export function parseInputValue(raw: string): number {
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : floatToCents(parsed);
}
