import { describe, expect, it } from 'vitest';
import { addMonths, monthKey, monthYearOf } from './date.utils';

describe('monthYearOf', () => {
  it('extracts year/month/day from an ISO string without timezone drift', () => {
    // Regression: new Date('2026-01-01T00:00:00.000Z').getMonth() in UTC-3
    // resolves to Dec/31 local time. monthYearOf must not go through Date.
    expect(monthYearOf('2026-01-01T00:00:00.000Z')).toEqual({ year: 2026, month: 1, day: 1 });
    expect(monthYearOf('2026-01-01')).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe('addMonths', () => {
  it('rolls over to the next year past December', () => {
    expect(addMonths(12, 2026, 1)).toEqual({ month: 1, year: 2027, day: 1 });
  });

  it('clamps the day to the last day of a shorter target month', () => {
    // Jan 31 + 1 month -> Feb has at most 28/29 days
    expect(addMonths(1, 2026, 1, 31)).toEqual({ month: 2, year: 2026, day: 28 });
  });

  it('preserves the day when the target month is long enough', () => {
    expect(addMonths(1, 2026, 2, 15)).toEqual({ month: 3, year: 2026, day: 15 });
  });
});

describe('monthKey', () => {
  it('produces a comparable key that increases month over month', () => {
    expect(monthKey(12, 2026)).toBeLessThan(monthKey(1, 2027));
    expect(monthKey(1, 2026)).toBeLessThan(monthKey(2, 2026));
  });
});
