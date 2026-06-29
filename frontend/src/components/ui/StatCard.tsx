import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  iconBg?: string;
  sub?: string;
  valueColor?: string;
}

export function StatCard({
  label,
  value,
  icon,
  iconBg = 'bg-gray-100',
  sub,
  valueColor = 'text-gray-900',
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className={`text-xl font-bold mt-1 ${valueColor}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {icon && (
          <div className={`p-2.5 rounded-lg shrink-0 ${iconBg}`}>{icon}</div>
        )}
      </div>
    </div>
  );
}
