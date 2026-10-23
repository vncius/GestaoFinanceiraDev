import i18n from '../i18n';

const INTL_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

// Alíquota em bps → "6" / "6,5" (no idioma ativo), sem o "%".
export function formatRateBps(bps: number, language: string = i18n.language ?? 'pt'): string {
  return new Intl.NumberFormat(INTL_LOCALE[language] ?? language, { maximumFractionDigits: 2 }).format(bps / 100);
}

// "out/26" do mês de competência: o da emissão da NF.
export function competenceLabel(month: number, year: number, language: string = i18n.language ?? 'pt'): string {
  const name = new Intl.DateTimeFormat(INTL_LOCALE[language] ?? language, { month: 'short' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
  return `${name}/${String(year).slice(2)}`;
}

export function competenceOfIssueDate(issueDate: string): string {
  const [y, m] = issueDate.slice(0, 7).split('-').map(Number);
  return competenceLabel(m, y);
}

// originId da despesa de imposto = "<accountId>:AAAA-MM".
export function competenceOfOriginId(originId: string | null): string | null {
  const m = /:(\d{4})-(\d{2})$/.exec(originId ?? '');
  return m ? competenceLabel(Number(m[2]), Number(m[1])) : null;
}
