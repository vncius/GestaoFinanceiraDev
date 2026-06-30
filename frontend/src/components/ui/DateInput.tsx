import { useEffect, useState } from 'react';

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void; // YYYY-MM-DD
  className?: string;
  required?: boolean;
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function digitsToISO(digits: string): string {
  if (digits.length < 8) return '';
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

export function DateInput({ value, onChange, className, required }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let digits = e.target.value.replace(/\D/g, '');
    if (digits.length > 8) digits = digits.slice(0, 8);

    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;

    setText(formatted);

    if (digits.length === 8) {
      const iso = digitsToISO(digits);
      if (iso) onChange(iso);
    }
  }

  function handleBlur() {
    if (text.replace(/\D/g, '').length < 8) setText(isoToDisplay(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="dd/mm/aaaa"
      maxLength={10}
      required={required}
    />
  );
}
