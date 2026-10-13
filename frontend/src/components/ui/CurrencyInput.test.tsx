import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CurrencyInput, digitsToCents } from './CurrencyInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CurrencyInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('digitsToCents', () => {
  it('usa só os dígitos, da direita para a esquerda', () => {
    expect(digitsToCents('R$ 15,00')).toBe(1500);
    expect(digitsToCents('1.234,56')).toBe(123456);
    expect(digitsToCents('abc')).toBe(0);
    expect(digitsToCents('R$ 0,05')).toBe(5);
  });

  it('limita ao valor máximo', () => {
    expect(digitsToCents('99999999999999')).toBe(999_999_999);
  });
});

describe('CurrencyInput', () => {
  it('digitar um dígito no fim desloca a máscara', () => {
    render(<Harness initial="15" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('R$ 15,00');
    fireEvent.change(input, { target: { value: 'R$ 15,007' } });
    expect(input.value).toBe('R$ 150,07');
    expect(screen.getByTestId('value').textContent).toBe('150.07');
  });

  it('apagar o último caractere remove o último dígito', () => {
    render(<Harness initial="15" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'R$ 15,0' } });
    expect(input.value).toBe('R$ 1,50');
  });

  it('colar um valor formatado funciona', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.234,56' } });
    expect(input.value).toBe('R$ 1.234,56');
    expect(screen.getByTestId('value').textContent).toBe('1234.56');
  });

  it('apagar tudo deixa vazio', () => {
    render(<Harness initial="15" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(screen.getByTestId('value').textContent).toBe('');
  });
});
