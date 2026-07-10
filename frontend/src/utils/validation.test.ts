import { describe, expect, it } from 'vitest';
import '../i18n';
import { getMissingFields, missingFieldsMessage } from './validation';

describe('getMissingFields', () => {
  it('returns labels only of invalid fields, preserving order', () => {
    const missing = getMissingFields([
      { label: 'Descrição', valid: true },
      { label: 'Categoria', valid: false },
      { label: 'Valor', valid: false },
    ]);
    expect(missing).toEqual(['Categoria', 'Valor']);
  });

  it('returns an empty array when all fields are valid', () => {
    expect(getMissingFields([{ label: 'Descrição', valid: true }])).toEqual([]);
  });
});

describe('missingFieldsMessage', () => {
  it('joins missing field labels into a single message', () => {
    expect(missingFieldsMessage(['Categoria', 'Valor'])).toBe(
      'Preencha os campos obrigatórios: Categoria, Valor.',
    );
  });
});
