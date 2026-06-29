import { useState, useEffect } from 'react';

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const n = Math.floor(cents / 10);
      setCents(n);
      onChange(n === 0 ? '' : String(n / 100));
    } else if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const n = cents * 10 + parseInt(e.key);
      if (n > 999_999_999) return;
      setCents(n);
      onChange(String(n / 100));
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={centsToDisplay(cents)}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onChange={() => {}}
    />
  );
}
