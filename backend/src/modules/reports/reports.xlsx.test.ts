import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildStatementXlsx } from './reports.xlsx';
import { StatementReport } from './reports.types';
import { InvoiceStatus } from '../credit-cards/credit-cards.types';
import { CashFlowSummary } from '../cash-flow/cash-flow.types';

const summary = {
  initialBalance: 100000, projectedInitialBalance: 100000, expectedIncome: 500000, receivedIncome: 300000,
  expectedPayments: 100000, paidPayments: 80000, expectedExtraExpenses: 0, paidExtraExpenses: 0,
  creditCardInvoices: 20000, paidCreditCardInvoices: 0, pendingIncome: 200000, pendingIncomeCount: 1,
  pendingExpenses: 40000, pendingExpensesCount: 2, transferInflow: 0, expectedTransferInflow: 0,
  transferOutflow: 0, expectedTransferOutflow: 0, projectedBalance: 480000, realizedBalance: 320000,
} as CashFlowSummary;

const report = (): StatementReport => ({
  month: 10, year: 2026,
  scope: { accountId: null, accountName: null },
  generatedAt: '2026-10-28T12:00:00.000Z',
  summary,
  accounts: [{ id: 'a', name: 'PJ', initialBalance: 100000, balance: 320000 }],
  categories: {
    income: [{ categoryId: 'c1', categoryName: 'Serviços', amount: 300000, percentage: 100 }],
    expenses: [{ categoryId: null, categoryName: 'Sem categoria', amount: 80000, percentage: 100 }],
  },
  evolution: [{ month: 10, year: 2026, income: 300000, expenses: 80000, net: 220000 }],
  incomes: [
    { id: '1', date: '2026-10-05T12:00:00.000Z', kind: 'income', description: '=HYPERLINK("x")', categoryName: 'Serviços', accountName: 'PJ', invoiceRatePct: 6, amount: 300000, settled: true, fixed: false },
    { id: '2', date: '2026-10-20T12:00:00.000Z', kind: 'income', description: 'Cliente B', categoryName: null, accountName: 'PJ', invoiceRatePct: null, amount: 200000, settled: false, fixed: true },
  ],
  expenses: [
    { id: '3', date: '2026-10-08T12:00:00.000Z', kind: 'payment', description: 'Aluguel', categoryName: null, accountName: 'PJ', invoiceRatePct: null, amount: 80000, settled: true, fixed: true },
  ],
  invoices: [{
    id: 'i', cardName: 'Visa', dueDate: '2026-10-10T12:00:00.000Z', status: InvoiceStatus.OPEN, paymentAccountName: 'PJ', total: 20000,
    purchases: [
      { purchaseDate: '2026-10-02T12:00:00.000Z', description: 'Notebook', categoryName: 'Equip', installment: '3/10', amount: 25000, refund: false },
      { purchaseDate: '2026-10-03T12:00:00.000Z', description: 'Loja', categoryName: null, installment: null, amount: -5000, refund: true },
    ],
  }],
  transfers: [{ id: 't', date: '2026-10-12T12:00:00.000Z', description: 'Reserva', direction: 'out', fromAccountName: 'PJ', toAccountName: 'Ext', amount: 10000, settled: true, autoReserve: true }],
});

async function load(r: StatementReport, lang: 'pt' | 'en' | 'es' = 'pt') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildStatementXlsx(r, lang)) as never);
  return wb;
}

describe('buildStatementXlsx', () => {
  it('cria as sete abas no idioma pedido', async () => {
    expect((await load(report())).worksheets.map((w) => w.name)).toEqual(
      ['Resumo', 'Entradas', 'Saídas', 'Cartões', 'Transferências', 'Categorias', 'Evolução']);
    expect((await load(report(), 'en')).worksheets[0].name).toBe('Summary');
  });

  it('valores viram reais numéricos e datas viram data', async () => {
    const ws = (await load(report())).getWorksheet('Entradas')!;
    expect(ws.getCell('A2').value).toBeInstanceOf(Date);
    expect(ws.getCell('F2').value).toBe(3000);
    expect(ws.getCell('F2').numFmt).toContain('#,##0.00');
    expect(ws.getCell('F3').value).toBe(2000);
  });

  it('texto que começa com = fica texto', async () => {
    const cell = (await load(report())).getWorksheet('Entradas')!.getCell('B2');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe('=HYPERLINK("x")');
  });

  it('saídas negativas, com a fatura em uma linha e total por SUBTOTAL', async () => {
    const ws = (await load(report())).getWorksheet('Saídas')!;
    const values = [ws.getCell('F2').value, ws.getCell('F3').value];
    expect(values).toEqual([-800, -200]);
    const kinds = [ws.getCell('B2').value, ws.getCell('B3').value];
    expect(kinds).toContain('Fatura do cartão');
    expect(ws.getTable('TabSaidas')).toBeTruthy();
  });

  it('cartões: compras com estorno negativo e total geral', async () => {
    const ws = (await load(report())).getWorksheet('Cartões')!;
    const flat: unknown[] = [];
    ws.eachRow((row) => row.eachCell((c) => flat.push(c.value)));
    expect(flat).toContain(250);
    expect(flat).toContain(-50);
    expect(flat).toContain('Total geral');
    expect(flat.filter((v) => v === 200).length).toBeGreaterThanOrEqual(2);
  });

  it('resumo traz indicadores em reais', async () => {
    const ws = (await load(report())).getWorksheet('Resumo')!;
    const flat: unknown[] = [];
    ws.eachRow((row) => row.eachCell((c) => flat.push(c.value)));
    expect(flat).toContain(3200);
    expect(flat).toContain('Todas as contas');
  });

  it('sem lançamentos gera as abas com aviso, sem quebrar', async () => {
    const r = { ...report(), incomes: [], expenses: [], invoices: [], transfers: [] };
    const wb = await load(r);
    expect(wb.getWorksheet('Entradas')!.getCell('A1').value).toBe('Sem lançamentos no período');
  });
});

describe('total das tabelas', () => {
  it('a linha de total usa SUBTOTAL (continua certa com filtro)', async () => {
    const buf = await buildStatementXlsx(report(), 'pt');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const table = wb.getWorksheet('Entradas')!.getTable('TabEntradas');
    const col = (table as unknown as { table: { columns: { totalsRowFunction?: string }[] } }).table.columns[5];
    expect(col.totalsRowFunction).toBe('sum');
  });
});

describe('gráficos nativos (R3)', () => {
  const wellFormed = (xml: string): void => {
    const parser = new SaxesParser({ xmlns: true });
    let error: Error | null = null;
    parser.on('error', (e) => { error = e; });
    parser.write(xml).close();
    expect(error).toBeNull();
  };

  it('acrescenta desenho, dois gráficos, relações e content types', async () => {
    const zip = await JSZip.loadAsync(await buildStatementXlsx(report(), 'pt'));
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining([
      'xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/drawings/drawing1.xml',
      'xl/drawings/_rels/drawing1.xml.rels', 'xl/worksheets/_rels/sheet1.xml.rels',
    ]));
    const types = await zip.file('[Content_Types].xml')!.async('string');
    expect(types).toContain('/xl/drawings/drawing1.xml');
    expect(types).toContain('/xl/charts/chart1.xml');
    expect(types).toContain('/xl/charts/chart2.xml');
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toMatch(/<drawing r:id="rIdDrawing1"\/><\/worksheet>$/);
    for (const n of ['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/drawings/drawing1.xml',
      'xl/drawings/_rels/drawing1.xml.rels', 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/worksheets/sheet1.xml', '[Content_Types].xml']) {
      wellFormed(await zip.file(n)!.async('string'));
    }
  });

  it('os gráficos apontam para os intervalos das abas Evolução e Categorias', async () => {
    const zip = await JSZip.loadAsync(await buildStatementXlsx(report(), 'pt'));
    const bars = await zip.file('xl/charts/chart1.xml')!.async('string');
    expect(bars).toContain('<c:f>&apos;Evolução&apos;!$B$2:$B$2</c:f>');
    expect(bars).toContain('<c:barChart>');
    const ring = await zip.file('xl/charts/chart2.xml')!.async('string');
    expect(ring).toContain('<c:doughnutChart>');
    expect(ring).toContain('<c:f>&apos;Categorias&apos;!$F$2:$F$2</c:f>');
  });

  it('nome de categoria com caracteres de XML sai escapado', async () => {
    const r = report();
    r.categories.expenses = [{ categoryId: 'x', categoryName: 'A & <B> "C"', amount: 1000, percentage: 100 }];
    const zip = await JSZip.loadAsync(await buildStatementXlsx(r, 'pt'));
    const ring = await zip.file('xl/charts/chart2.xml')!.async('string');
    expect(ring).toContain('A &amp; &lt;B&gt; &quot;C&quot;');
    wellFormed(ring);
  });

  it('top 8 + Outras na rosca', async () => {
    const r = report();
    r.categories.expenses = Array.from({ length: 11 }, (_, i) => ({ categoryId: `c${i}`, categoryName: `Cat ${i}`, amount: 1000 - i, percentage: 9 }));
    const wb = await load(r);
    const ws = wb.getWorksheet('Categorias')!;
    expect(ws.getCell('E10').value).toBe('Outras');
    expect(ws.getCell('F10').value).toBeCloseTo((1000 - 8 + 1000 - 9 + 1000 - 10) / 100);
  });

  it('sem despesas por categoria nem evolução, não há gráficos', async () => {
    const r = { ...report(), evolution: [], categories: { income: [], expenses: [] } };
    const zip = await JSZip.loadAsync(await buildStatementXlsx(r, 'pt'));
    expect(zip.file('xl/charts/chart1.xml')).toBeNull();
    expect(zip.file('xl/drawings/drawing1.xml')).toBeNull();
  });

  it('o arquivo com gráficos ainda abre no ExcelJS', async () => {
    expect((await load(report())).worksheets).toHaveLength(7);
  });
});
