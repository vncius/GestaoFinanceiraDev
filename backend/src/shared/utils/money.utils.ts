/** Converte reais para centavos (armazena sempre em centavos). */
export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/** Converte centavos para reais. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Formata centavos como string monetária brasileira. */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(fromCents(cents));
}

/** Calcula um percentual de um valor em centavos, retornando centavos. */
export function applyPercentage(cents: number, percentage: number): number {
  return Math.round((cents * percentage) / 100);
}
