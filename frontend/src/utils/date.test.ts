import { describe, expect, it } from 'vitest';
import {
  firstDayOfMonthISO,
  formatDate,
  formatDateShort,
  formatMonthYear,
  formatMonthYearShort,
  monthYearFromDate,
  toInputDate,
} from './date';

describe('formatDate', () => {
  it('formats an ISO date as dd/MM/yyyy without shifting via timezone', () => {
    // Regression: parsing through `new Date(iso)` can shift a day back in
    // UTC-negative offsets. formatDate must slice the ISO string instead.
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });
});

describe('formatDateShort', () => {
  it('formats as dd/MM', () => {
    expect(formatDateShort('2026-03-05')).toBe('05/03');
  });
});

describe('formatMonthYear', () => {
  it('formats month index (1-12) with the Portuguese month name', () => {
    expect(formatMonthYear(1, 2026)).toBe('Janeiro 2026');
    expect(formatMonthYear(12, 2026)).toBe('Dezembro 2026');
  });
});

describe('toInputDate', () => {
  it('truncates an ISO datetime to the date-only portion for <input type="date">', () => {
    expect(toInputDate('2026-03-05T12:34:56.000Z')).toBe('2026-03-05');
  });
});

describe('firstDayOfMonthISO', () => {
  it('pads the month to two digits', () => {
    expect(firstDayOfMonthISO(3, 2026)).toBe('2026-03-01');
    expect(firstDayOfMonthISO(12, 2026)).toBe('2026-12-01');
  });
});

describe('monthYearFromDate', () => {
  it('extracts month and year from an ISO date', () => {
    expect(monthYearFromDate('2026-07-15')).toEqual({ month: 7, year: 2026 });
  });
});

describe('formatMonthYearShort', () => {
  it('abrevia o mês sem ponto e usa o ano com dois dígitos', () => {
    expect(formatMonthYearShort(10, 2026, 'pt-BR')).toBe('out/26');
    expect(formatMonthYearShort(1, 2027, 'en-US')).toBe('Jan/27');
  });
});
