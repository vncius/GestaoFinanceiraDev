import { describe, expect, it } from 'vitest';
import { applyPercentage, formatCurrency, fromCents, toCents } from './money.utils';

describe('toCents / fromCents', () => {
  it('round-trips a reais value to cents and back', () => {
    expect(toCents(19.9)).toBe(1990);
    expect(fromCents(1990)).toBe(19.9);
  });

  it('rounds instead of truncating floating point artifacts', () => {
    expect(toCents(10.005)).toBe(1001);
  });
});

describe('formatCurrency', () => {
  it('formats cents as BRL', () => {
    expect(formatCurrency(150000)).toBe('R$ 1.500,00');
  });
});

describe('applyPercentage', () => {
  it('computes a rounded percentage of a cents value', () => {
    expect(applyPercentage(10000, 10)).toBe(1000);
    expect(applyPercentage(999, 33)).toBe(330);
  });
});
