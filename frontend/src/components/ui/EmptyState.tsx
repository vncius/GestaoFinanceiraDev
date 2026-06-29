import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title = 'Nenhum registro encontrado',
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-400 dark:text-gray-500">
        {icon ?? <Inbox size={24} />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        {description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
