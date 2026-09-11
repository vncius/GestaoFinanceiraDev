import { describe, it, expect } from 'vitest';
import { sortByName } from './sort';

describe('sortByName', () => {
  it('ordena alfabeticamente ignorando acento e caixa', () => {
    const items = [{ name: 'salário' }, { name: 'Água' }, { name: 'aluguel' }, { name: 'Ébano' }];
    expect(sortByName(items).map((i) => i.name)).toEqual(['Água', 'aluguel', 'Ébano', 'salário']);
  });

  it('ordena números de forma natural', () => {
    const items = [{ name: 'Cartão 10' }, { name: 'Cartão 2' }, { name: 'Cartão 1' }];
    expect(sortByName(items).map((i) => i.name)).toEqual(['Cartão 1', 'Cartão 2', 'Cartão 10']);
  });

  it('não altera o array original', () => {
    const items = [{ name: 'b' }, { name: 'a' }];
    sortByName(items);
    expect(items.map((i) => i.name)).toEqual(['b', 'a']);
  });
});
