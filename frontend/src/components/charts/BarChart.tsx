export interface BarGroup {
  label: string;
  income: number;
  expenses: number;
}

interface Props {
  data: BarGroup[];
  incomeLabel: string;
  expensesLabel: string;
  height?: number;
}

const WIDTH = 720;
const PAD = { top: 22, right: 8, bottom: 26, left: 8 };
// Verde e vermelho distinguíveis também em impressão P&B pelo rótulo de valor.
const INCOME = '#15803d';
const EXPENSES = '#b91c1c';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const short = (cents: number) => (cents === 0 ? '0' : compact.format(cents / 100));

// Colunas agrupadas (entradas × saídas) em SVG puro, com o valor sobre cada barra.
export function BarChart({ data, incomeLabel, expensesLabel, height = 200 }: Props) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]));
  const plotH = height - PAD.top - PAD.bottom;
  const slot = (WIDTH - PAD.left - PAD.right) / Math.max(1, data.length);
  const barW = Math.min(22, slot / 2 - 2);

  const bar = (cents: number, x: number, color: string) => {
    const h = (cents / max) * plotH;
    const y = PAD.top + plotH - h;
    return (
      <g>
        <rect x={x} y={y} width={barW} height={h} fill={color} />
        <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill="#374151">{short(cents)}</text>
      </g>
    );
  };

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" role="img" aria-label={`${incomeLabel} / ${expensesLabel}`}>
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#9ca3af" strokeWidth="1" />
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={d.label}>
              {bar(d.income, cx - barW - 1, INCOME)}
              {bar(d.expenses, cx + 1, EXPENSES)}
              <text x={cx} y={height - 8} textAnchor="middle" fontSize="9" fill="#4b5563">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: INCOME }} />{incomeLabel}</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: EXPENSES }} />{expensesLabel}</span>
      </div>
    </div>
  );
}
