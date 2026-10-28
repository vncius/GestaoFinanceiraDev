export interface DonutSlice {
  label: string;
  value: number;
}

interface Props {
  slices: DonutSlice[];
  formatValue: (value: number) => string;
  size?: number;
}

export const DONUT_COLORS = ['#1d4ed8', '#c2410c', '#4b5563', '#a16207', '#0e7490', '#15803d', '#6d28d9', '#9f1239', '#78716c'];

// Rosca em SVG puro. A legenda ao lado traz valor e percentual de cada fatia,
// então a leitura não depende da cor (impressão P&B).
export function DonutChart({ slices, formatValue, size = 150 }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = 52;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 150 150" width={size} height={size} className="shrink-0" role="img">
        <g transform="rotate(-90 75 75)">
          {total > 0 && slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="75" cy="75" r={r} fill="none" strokeWidth={stroke}
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <ul className="text-xs space-y-0.5 min-w-0">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate text-gray-700">{s.label}</span>
            <span className="text-gray-900 font-medium whitespace-nowrap">
              {formatValue(s.value)} · {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
