import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function IconActionButton({
  title,
  onClick,
  className = '',
  loading = false,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-busy={loading}
      disabled={isDisabled}
      onClick={onClick}
      className={`p-1 sm:p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}
