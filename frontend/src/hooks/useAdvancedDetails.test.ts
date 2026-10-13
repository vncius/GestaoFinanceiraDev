import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAdvancedDetails, useAdvancedDetails } from './useAdvancedDetails';

describe('useAdvancedDetails', () => {
  beforeEach(() => localStorage.clear());

  it('começa desligada e persiste a escolha', () => {
    const { result } = renderHook(() => useAdvancedDetails());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(getAdvancedDetails()).toBe(true);
  });

  it('sincroniza outros componentes que usam a preferência', () => {
    const a = renderHook(() => useAdvancedDetails());
    const b = renderHook(() => useAdvancedDetails());
    act(() => a.result.current[1](true));
    expect(b.result.current[0]).toBe(true);
  });
});
