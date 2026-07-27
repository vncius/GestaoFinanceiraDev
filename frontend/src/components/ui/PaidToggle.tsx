import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';

export function PaidToggle({
  paid,
  urgent = false,
  loading = false,
  disabled = false,
  onToggle,
  paidTitle,
  unpaidTitle,
}: {
  paid: boolean;
  urgent?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  paidTitle: string;
  unpaidTitle: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      title={paid ? paidTitle : unpaidTitle}
      aria-label={paid ? paidTitle : unpaidTitle}
      aria-busy={loading}
      disabled={isDisabled}
      onClick={onToggle}
      className={`p-1 sm:p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        paid
          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
          : urgent
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : paid ? (
        <ThumbsUp size={16} />
      ) : (
        <ThumbsDown size={16} />
      )}
    </button>
  );
}
