// Helpers puros de data usados tanto por CreditCardsService quanto pelo
// serviço de importação de fatura (credit-card-invoice-import.service.ts).
// Extraídos para não duplicar/discrepar a regra de "qual fatura uma compra
// cai" entre lançamento manual e importado.

// Extrai ano/mês/dia direto da string ISO (sem passar por Date/timezone
// local), para não sofrer o deslocamento de um dia em fusos com offset
// negativo (ex.: UTC-3).
export function getInvoiceMonth(
  purchaseDateISO: string,
  closingDay: number,
): { month: number; year: number } {
  const [yearStr, monthStr, dayStr] = purchaseDateISO.slice(0, 10).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (day <= closingDay) {
    return { month, year };
  }
  if (month === 12) {
    return { month: 1, year: year + 1 };
  }
  return { month: month + 1, year };
}

export function addMonths(
  month: number,
  year: number,
  count: number,
): { month: number; year: number } {
  const d = new Date(year, month - 1 + count, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export function monthKey(month: number, year: number): number {
  return year * 12 + month;
}
