import ExcelJS from 'exceljs';
import { StatementReport } from './reports.types';
import { getReportLabels, ReportLabels, ReportLang } from './reports.labels';

// Gera o XLSX do relatório do extrato (docs/plano-relatorio-extrato.md, 4.2).
// Valores em centavos até aqui; viram reais só na célula. Texto vai sempre como
// string (o Excel não avalia), e nenhuma fórmula é montada com texto do usuário.

const DATE_FMT = 'dd/mm/yyyy';
const MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const PCT_FMT = '0.0"%"';
const HEADER_FILL = 'FF1F4E78';
const TITLE_FILL = 'FFDDEBF7';
const BLOCK_FILL = 'FFF2F2F2';
const RED = 'FFC00000';
const MAX_SHEET_NAME = 31;

const reais = (cents: number): number => cents / 100;
const toDate = (iso: string): Date => new Date(iso);
const sheetName = (name: string): string => name.slice(0, MAX_SHEET_NAME);
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export async function buildStatementXlsx(report: StatementReport, lang: ReportLang): Promise<Buffer> {
  const L = getReportLabels(lang);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(report.generatedAt);
  wb.creator = 'Gestão Financeira';

  buildSummary(wb, report, L);
  buildLineSheet(wb, report, L, 'incomes');
  buildLineSheet(wb, report, L, 'expenses');
  buildCards(wb, report, L);
  buildTransfers(wb, report, L);
  buildCategories(wb, report, L);
  buildEvolution(wb, report, L);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = solid(HEADER_FILL);
  row.alignment = { vertical: 'middle', wrapText: true };
}

function titleRow(ws: ExcelJS.Worksheet, text: string, span: number): void {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, span);
  row.font = { bold: true, size: 14 };
  row.fill = solid(TITLE_FILL);
  row.height = 22;
}

function blockRow(ws: ExcelJS.Worksheet, text: string, span: number): ExcelJS.Row {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, span);
  row.font = { bold: true };
  row.fill = solid(BLOCK_FILL);
  return row;
}

function setWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function money(row: ExcelJS.Row, ...cols: number[]): void {
  cols.forEach((c) => { row.getCell(c).numFmt = MONEY_FMT; });
}

function buildSummary(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels): void {
  const ws = wb.addWorksheet(sheetName(L.sheets.summary));
  setWidths(ws, [38, 18, 18]);
  titleRow(ws, L.title, 3);
  const meta: [string, string | Date][] = [
    [L.period, `${String(r.month).padStart(2, '0')}/${r.year}`],
    [L.scope, r.scope.accountName ?? L.allAccounts],
    [L.generatedAt, toDate(r.generatedAt)],
  ];
  meta.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'left' };
    if (value instanceof Date) row.getCell(2).numFmt = `${DATE_FMT} hh:mm`;
  });
  ws.addRow([]);

  const s = r.summary;
  styleHeader(ws.addRow([L.indicator, L.expected, L.realized]));
  const rows: [string, number | null, number][] = [
    [L.initialBalance, null, s.initialBalance],
    [L.incomeTotal, s.expectedIncome, s.receivedIncome],
    [L.expenseTotal, -(s.expectedPayments + s.expectedExtraExpenses + s.creditCardInvoices), -(s.paidPayments + s.paidExtraExpenses + s.paidCreditCardInvoices)],
    [L.betweenAccounts, s.expectedTransferInflow - s.expectedTransferOutflow, s.transferInflow - s.transferOutflow],
    [L.finalBalance, s.projectedBalance, s.realizedBalance],
  ];
  rows.forEach(([label, expected, realized], i) => {
    const row = ws.addRow([label, expected === null ? null : reais(expected), reais(realized)]);
    money(row, 2, 3);
    if (i === rows.length - 1) row.font = { bold: true };
  });
  ws.addRow([]);
  money(ws.addRow([`${L.pendingIncome} (${s.pendingIncomeCount})`, reais(s.pendingIncome)]), 2);
  money(ws.addRow([`${L.pendingExpenses} (${s.pendingExpensesCount})`, reais(s.pendingExpenses)]), 2);
  ws.addRow([]);

  blockRow(ws, L.balanceByAccount, 3);
  styleHeader(ws.addRow([L.account, L.initial, L.final]));
  r.accounts.forEach((a) => money(ws.addRow([a.name, reais(a.initialBalance), reais(a.balance)]), 2, 3));
}

type Cell = string | number | Date | null;

function buildLineSheet(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels, which: 'incomes' | 'expenses'): void {
  const isIncome = which === 'incomes';
  const ws = wb.addWorksheet(sheetName(L.sheets[which]));
  const columns = isIncome
    ? [L.date, L.description, L.category, L.account, L.invoiceRate, L.amount, L.status, L.fixed]
    : [L.date, L.type, L.description, L.category, L.account, L.amount, L.status];
  const amountCol = 6;
  setWidths(ws, isIncome ? [12, 36, 22, 22, 9, 16, 14, 8] : [12, 18, 36, 22, 22, 16, 14]);

  const body: Cell[][] = [];
  r[which].forEach((l) => {
    const status = l.settled ? (isIncome ? L.received : L.paid) : (isIncome ? L.toReceive : L.toPay);
    const cat = l.categoryName ?? L.uncategorized;
    body.push(isIncome
      ? [toDate(l.date), l.description, cat, l.accountName, l.invoiceRatePct, reais(l.amount), status, l.fixed ? L.yes : L.no]
      : [toDate(l.date), L.kinds[l.kind as 'payment' | 'extra' | 'invoiceTax'], l.description, cat, l.accountName, -reais(l.amount), status]);
  });
  if (!isIncome) {
    // Fatura = uma linha; o detalhe das compras fica na aba Cartões.
    r.invoices.forEach((inv) => body.push([
      toDate(inv.dueDate), L.kinds.invoice, inv.cardName, '', inv.paymentAccountName ?? '', -reais(inv.total),
      inv.status === 'PAID' ? L.paid : L.toPay,
    ]));
  }
  body.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime());

  if (body.length === 0) {
    ws.addRow([L.noData]);
    return;
  }

  ws.addTable({
    name: isIncome ? 'TabEntradas' : 'TabSaidas',
    ref: 'A1',
    headerRow: true,
    totalsRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: columns.map((name, i) => ({
      name,
      filterButton: true,
      ...(i === 0 ? { totalsRowLabel: L.total } : {}),
      ...(i === amountCol - 1 ? { totalsRowFunction: 'sum' as const } : {}),
    })),
    rows: body,
  });

  body.forEach((line, i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).numFmt = DATE_FMT;
    row.getCell(amountCol).numFmt = MONEY_FMT;
    if (isIncome) row.getCell(5).numFmt = PCT_FMT;
    else row.getCell(amountCol).font = { color: { argb: RED } };
  });
  const totalRow = ws.getRow(2 + body.length);
  totalRow.getCell(amountCol).numFmt = MONEY_FMT;
  totalRow.font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildCards(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels): void {
  const ws = wb.addWorksheet(sheetName(L.sheets.cards));
  setWidths(ws, [18, 38, 24, 12, 16]);
  titleRow(ws, L.sheets.cards, 5);
  if (r.invoices.length === 0) {
    ws.addRow([L.noData]);
    return;
  }

  const byCard = new Map<string, typeof r.invoices>();
  r.invoices.forEach((inv) => byCard.set(inv.cardName, [...(byCard.get(inv.cardName) ?? []), inv]));

  let grand = 0;
  byCard.forEach((invoices, cardName) => {
    let cardTotal = 0;
    invoices.forEach((inv) => {
      ws.addRow([]);
      blockRow(ws, `${L.card}: ${cardName}`, 5);
      const head = ws.addRow([L.dueDate, toDate(inv.dueDate), L.invoiceStatus[inv.status] ?? inv.status, '', reais(inv.total)]);
      head.getCell(2).numFmt = DATE_FMT;
      head.getCell(2).alignment = { horizontal: 'left' };
      money(head, 5);
      head.font = { bold: true };
      if (inv.paymentAccountName) ws.addRow([L.paymentAccount, inv.paymentAccountName]);
      styleHeader(ws.addRow([L.purchaseDate, L.description, L.category, L.installment, L.amount]));
      inv.purchases.forEach((p) => {
        const row = ws.addRow([
          toDate(p.purchaseDate),
          p.refund ? `${p.description} (${L.refund})` : p.description,
          p.categoryName ?? L.uncategorized,
          p.installment ?? '',
          reais(p.amount),
        ]);
        row.getCell(1).numFmt = DATE_FMT;
        row.getCell(1).alignment = { horizontal: 'left' };
        money(row, 5);
        if (p.amount < 0) row.getCell(5).font = { color: { argb: RED } };
      });
      cardTotal += inv.total;
    });
    ws.addRow([]);
    const sub = ws.addRow([`${L.cardSubtotal}: ${cardName}`, '', '', '', reais(cardTotal)]);
    sub.font = { bold: true };
    money(sub, 5);
    grand += cardTotal;
  });
  ws.addRow([]);
  const g = ws.addRow([L.grandTotal, '', '', '', reais(grand)]);
  g.font = { bold: true };
  g.fill = solid(TITLE_FILL);
  money(g, 5);
}

function buildTransfers(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels): void {
  const ws = wb.addWorksheet(sheetName(L.sheets.transfers));
  setWidths(ws, [12, 34, 22, 22, 16, 14, 18]);
  if (r.transfers.length === 0) {
    ws.addRow([L.noData]);
    return;
  }
  ws.addTable({
    name: 'TabTransferencias',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [L.date, L.description, L.from, L.to, L.amount, L.status, L.autoReserve].map((name) => ({ name, filterButton: true })),
    rows: r.transfers.map((t) => [
      toDate(t.date), t.description, t.fromAccountName, t.toAccountName,
      reais(t.direction === 'in' ? t.amount : -t.amount),
      t.settled ? L.paid : L.toPay, t.autoReserve ? L.yes : L.no,
    ]),
  });
  r.transfers.forEach((t, i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).numFmt = DATE_FMT;
    row.getCell(5).numFmt = MONEY_FMT;
    if (t.direction === 'out') row.getCell(5).font = { color: { argb: RED } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildCategories(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels): void {
  const ws = wb.addWorksheet(sheetName(L.sheets.categories));
  setWidths(ws, [32, 18, 10]);
  const block = (title: string, items: StatementReport['categories']['income']): void => {
    blockRow(ws, title, 3);
    styleHeader(ws.addRow([L.category, L.amount, L.percentage]));
    if (items.length === 0) {
      ws.addRow([L.noData]);
      ws.addRow([]);
      return;
    }
    const start = ws.rowCount + 1;
    items.forEach((c) => {
      const row = ws.addRow([c.categoryId === null ? L.uncategorized : c.categoryName, reais(c.amount), c.percentage]);
      money(row, 2);
      row.getCell(3).numFmt = PCT_FMT;
    });
    ws.addConditionalFormatting({
      ref: `B${start}:B${start + items.length - 1}`,
      rules: [{
        type: 'dataBar', priority: 1, gradient: false,
        cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF5B9BD5' },
      } as unknown as ExcelJS.ConditionalFormattingRule],
    });
    ws.addRow([]);
  };
  block(L.incomeByCategory, r.categories.income);
  block(L.expenseByCategory, r.categories.expenses);
}

function buildEvolution(wb: ExcelJS.Workbook, r: StatementReport, L: ReportLabels): void {
  const ws = wb.addWorksheet(sheetName(L.sheets.evolution));
  setWidths(ws, [12, 18, 18, 18]);
  styleHeader(ws.addRow([L.month, L.income, L.expenses, L.result]));
  r.evolution.forEach((e) => {
    money(ws.addRow([`${String(e.month).padStart(2, '0')}/${e.year}`, reais(e.income), reais(e.expenses), reais(e.net)]), 2, 3, 4);
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
