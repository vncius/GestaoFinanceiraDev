import { describe, expect, it } from 'vitest';
import {
  calcInvoiceTax,
  competenceOf,
  invoiceTaxDueDate,
  invoiceTaxOriginId,
  parseInvoiceTaxOriginId,
} from './invoice-tax.utils';

describe('competenceOf', () => {
  it('usa o mês da emissão sem deslocamento de fuso', () => {
    expect(competenceOf('2026-11-01T00:00:00.000Z')).toEqual({ year: 2026, month: 11 });
    expect(competenceOf('2026-10-31')).toEqual({ year: 2026, month: 10 });
  });
});

describe('calcInvoiceTax', () => {
  it('aplica a alíquota em centésimos de ponto percentual', () => {
    expect(calcInvoiceTax(1_000_000, 600)).toBe(60_000);
  });

  it('arredonda para o centavo mais próximo', () => {
    expect(calcInvoiceTax(10_001, 600)).toBe(600); // 600,06
    expect(calcInvoiceTax(10_009, 600)).toBe(601); // 600,54
  });

  it('alíquota zero gera imposto zero', () => {
    expect(calcInvoiceTax(123_456, 0)).toBe(0);
  });

  it('a soma dos impostos por NF é o total da despesa (não o imposto da soma)', () => {
    const amounts = [10_009, 10_009, 10_009];
    const sum = amounts.reduce((acc, a) => acc + calcInvoiceTax(a, 600), 0);
    expect(sum).toBe(1_803);
    expect(calcInvoiceTax(amounts.reduce((a, b) => a + b, 0), 600)).toBe(1_802);
  });
});

describe('invoiceTaxOriginId', () => {
  it('monta e desmonta a chave conta + mês', () => {
    const id = invoiceTaxOriginId('acc-1', { year: 2026, month: 3 });
    expect(id).toBe('acc-1:2026-03');
    expect(parseInvoiceTaxOriginId(id)).toEqual({ accountId: 'acc-1', competence: { year: 2026, month: 3 } });
  });

  it('recusa texto fora do formato', () => {
    expect(parseInvoiceTaxOriginId('acc-1')).toBeNull();
    expect(parseInvoiceTaxOriginId('acc-1:2026-13')).toBeNull();
  });
});

describe('invoiceTaxDueDate', () => {
  it('vence no dia 20 do mês seguinte por padrão', () => {
    expect(invoiceTaxDueDate({ year: 2026, month: 10 })).toBe('2026-11-20T00:00:00.000Z');
  });

  it('vira o ano depois de dezembro', () => {
    expect(invoiceTaxDueDate({ year: 2026, month: 12 }, 15)).toBe('2027-01-15T00:00:00.000Z');
  });

  it('faz clamp em meses curtos', () => {
    expect(invoiceTaxDueDate({ year: 2026, month: 1 }, 31)).toBe('2026-02-28T00:00:00.000Z');
  });
});
