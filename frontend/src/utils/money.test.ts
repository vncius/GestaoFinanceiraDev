import { describe, expect, it } from 'vitest';
import { centsToFloat, floatToCents, formatCurrency, parseInputValue } from './money';

// Intl.NumberFormat('pt-BR') separates the currency symbol from the amount
// with a non-breaking space (U+00A0), not a regular space.
const NBSP = ' ';

describe('floatToCents / centsToFloat', () => {
  it('round-trips a value', () => {
    expect(floatToCents(19.9)).toBe(1990);
    expect(centsToFloat(1990)).toBe(19.9);
  });
});

describe('formatCurrency', () => {
  it('formats cents as BRL with two decimal places', () => {
    expect(formatCurrency(150000)).toBe(`R$${NBSP}1.500,00`);
    expect(formatCurrency(0)).toBe(`R$${NBSP}0,00`);
  });
});

describe('parseInputValue', () => {
  it('parses a masked Brazilian currency string into cents', () => {
    expect(parseInputValue('1.234,56')).toBe(123456);
    expect(parseInputValue('R$ 10,00')).toBe(1000);
  });

  it('falls back to 0 for unparseable input', () => {
    expect(parseInputValue('')).toBe(0);
    expect(parseInputValue('abc')).toBe(0);
  });
});