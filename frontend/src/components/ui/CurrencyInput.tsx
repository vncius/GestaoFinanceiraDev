import { useState, useEffect } from 'react';

const MAX_CENTS = 999_999_999;

function centsToDisplay(cents: number): string {
  if (cents === 0) return '';
  const str = String(cents).padStart(3, '0');
  const decimal = str.slice(-2);
  const integer = str.slice(0, -2);
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${formatted},${decimal}`;
}

function parseToCents(floatStr: string): number {
  if (!floatStr) return 0;
  const f = parseFloat(floatStr);
  if (isNaN(f)) return 0;
  return Math.round(f * 100);
}

// Máscara "da direita para a esquerda": os dígitos do texto viram centavos.
// Lê o valor do próprio campo (onChange) em vez de interceptar teclas — assim
// funciona ao colar e em teclados virtuais do Android, que mandam keydown com
// key "Unidentified" (U12 do plano de UX).
export function digitsToCents(text: string): number {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return 0;
  const n = Number(digits.slice(0, String(MAX_CENTS).length));
  return Math.min(n, MAX_CENTS);
}

interface CurrencyInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}

export function CurrencyInput({ value, onChange, className = '', placeholder = 'R$ 0,00' }: CurrencyInputProps) {
  const [cents, setCents] = useState(() => parseToCents(value));

  useEffect(() => {
    const next = parseToCents(value);
    setCents((prev) => (prev !== next ? next : prev));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = digitsToCents(e.target.value);
    setCents(n);
    onChange(n === 0 ? '' : String(n / 100));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={centsToDisplay(cents)}
      placeholder={placeholder}
      onChange={handleChange}
    />
  );
}
