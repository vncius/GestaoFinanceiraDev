import JSZip from 'jszip';

// Gráficos nativos na aba Resumo (docs/plano-relatorio-extrato.md, 4.2 / R3).
// O ExcelJS não escreve gráficos: este pós-processador abre o zip e acrescenta
// as partes DrawingML com modelo fixo. Só entram aqui nomes de aba (fixos, dos
// rótulos), números e rótulos de categoria, sempre escapados para XML.

export interface EvolutionChartData {
  sheet: string;
  firstRow: number;
  lastRow: number;
  points: { label: string; income: number; expenses: number }[];
}

export interface PieChartData {
  sheet: string;
  firstRow: number;
  points: { name: string; value: number }[];
}

export interface SummaryChartsInput {
  summarySheetFile: string;
  evolution: EvolutionChartData | null;
  pie: PieChartData | null;
  titles: { evolution: string; pie: string; income: string; expenses: string };
}

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const REL_DRAWING = `${NS_R}/drawing`;
const REL_CHART = `${NS_R}/chart`;
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';

const PALETTE = ['2E75B6', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '264478', '9E480E', '636363'];
const INCOME_COLOR = '70AD47';
const EXPENSE_COLOR = 'C00000';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Referência de intervalo; o nome da aba vai entre aspas simples (apóstrofo dobrado).
const range = (sheet: string, col: string, first: number, last: number): string =>
  `'${sheet.replace(/'/g, "''")}'!$${col}$${first}:$${col}$${last}`;

const strCache = (values: string[]): string =>
  `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;

const numCache = (values: number[]): string =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`).join('')}</c:numCache>`;

const solidFill = (hex: string): string => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

const titleXml = (text: string): string =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

const chartSpace = (inner: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>${inner}</c:chartSpace>`;

function columnChartXml(d: EvolutionChartData, t: SummaryChartsInput['titles']): string {
  const cat = `<c:cat><c:strRef><c:f>${esc(range(d.sheet, 'A', d.firstRow, d.lastRow))}</c:f>${strCache(d.points.map((p) => p.label))}</c:strRef></c:cat>`;
  const series = (idx: number, col: string, name: string, color: string, values: number[]): string =>
    `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>` +
    `<c:tx><c:strRef><c:f>${esc(range(d.sheet, col, 1, 1))}</c:f>${strCache([name])}</c:strRef></c:tx>` +
    `<c:spPr>${solidFill(color)}</c:spPr><c:invertIfNegative val="0"/>${cat}` +
    `<c:val><c:numRef><c:f>${esc(range(d.sheet, col, d.firstRow, d.lastRow))}</c:f>${numCache(values)}</c:numRef></c:val></c:ser>`;
  return chartSpace(
    `<c:chart>${titleXml(t.evolution)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    series(0, 'B', t.income, INCOME_COLOR, d.points.map((p) => p.income)) +
    series(1, 'C', t.expenses, EXPENSE_COLOR, d.points.map((p) => p.expenses)) +
    `<c:gapWidth val="80"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>` +
    `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`,
  );
}

function doughnutChartXml(d: PieChartData, title: string): string {
  const last = d.firstRow + d.points.length - 1;
  const dPts = d.points
    .map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${solidFill(PALETTE[i % PALETTE.length])}</c:spPr></c:dPt>`)
    .join('');
  return chartSpace(
    `<c:chart>${titleXml(title)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:tx><c:v>${esc(title)}</c:v></c:tx>${dPts}` +
    `<c:dLbls><c:spPr><a:noFill/></c:spPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>` +
    `<c:cat><c:strRef><c:f>${esc(range(d.sheet, 'E', d.firstRow, last))}</c:f>${strCache(d.points.map((p) => p.name))}</c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${esc(range(d.sheet, 'F', d.firstRow, last))}</c:f>${numCache(d.points.map((p) => p.value))}</c:numRef></c:val></c:ser>` +
    `<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart></c:plotArea>` +
    `<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`,
  );
}

// Âncoras em colunas (0-based) E..L da aba Resumo, um gráfico abaixo do outro.
const anchorXml = (rid: string, id: number, name: string, fromRow: number, toRow: number): string =>
  `<xdr:twoCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
  `<xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
  `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
  `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
  `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;

export async function addSummaryCharts(buffer: Buffer, input: SummaryChartsInput): Promise<Buffer> {
  const charts: { xml: string; name: string }[] = [];
  if (input.evolution) charts.push({ xml: columnChartXml(input.evolution, input.titles), name: input.titles.evolution });
  if (input.pie) charts.push({ xml: doughnutChartXml(input.pie, input.titles.pie), name: input.titles.pie });
  if (charts.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = `xl/worksheets/${input.summarySheetFile}`;
  const sheetRelsPath = `xl/worksheets/_rels/${input.summarySheetFile}.rels`;
  const sheetXml = await zip.file(sheetPath)?.async('string');
  const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
  if (!sheetXml || !contentTypes || sheetXml.includes('<drawing ')) return buffer;

  // Partes novas.
  charts.forEach((c, i) => zip.file(`xl/charts/chart${i + 1}.xml`, c.xml));
  const anchors = charts.map((c, i) => anchorXml(`rId${i + 1}`, i + 2, c.name, i * 20, i * 20 + 18)).join('');
  zip.file(
    'xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anchors}</xdr:wsDr>`,
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/chart${i + 1}.xml"/>`).join('') +
    `</Relationships>`,
  );

  // Relação da aba com o desenho (cria o .rels ou acrescenta ao existente).
  const relTag = (id: string) => `<Relationship Id="${id}" Type="${REL_DRAWING}" Target="../drawings/drawing1.xml"/>`;
  const existingRels = await zip.file(sheetRelsPath)?.async('string');
  const drawingRid = 'rIdDrawing1';
  if (existingRels) {
    zip.file(sheetRelsPath, existingRels.replace('</Relationships>', `${relTag(drawingRid)}</Relationships>`));
  } else {
    zip.file(
      sheetRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTag(drawingRid)}</Relationships>`,
    );
  }

  // <drawing> vem depois de pageSetup e antes de legacyDrawing/tableParts.
  const drawingTag = `<drawing r:id="${drawingRid}"/>`;
  const marker = /<legacyDrawing[ />]|<tableParts[ >]|<\/worksheet>/.exec(sheetXml);
  if (!marker || !sheetXml.includes('xmlns:r=')) return buffer;
  zip.file(sheetPath, sheetXml.slice(0, marker.index) + drawingTag + sheetXml.slice(marker.index));

  const overrides =
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="${CT_DRAWING}"/>` +
    charts.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="${CT_CHART}"/>`).join('');
  zip.file('[Content_Types].xml', contentTypes.replace('</Types>', `${overrides}</Types>`));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
