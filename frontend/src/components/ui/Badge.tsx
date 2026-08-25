type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'purple';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  success: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  error: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  info: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {label}
    </span>
  );
}

// Status helpers
export function transactionStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    PENDING: { label: 'Pendente', variant: 'warning' },
    PAID: { label: 'Pago', variant: 'success' },
    RECEIVED: { label: 'Recebido', variant: 'success' },
    CANCELED: { label: 'Cancelado', variant: 'error' },
    REVERSED: { label: 'Revertido', variant: 'default' },
  };
  const cfg = map[status] ?? { label: status, variant: 'default' };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}

export function invoiceStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    OPEN: { label: 'Aberta', variant: 'info' },
    CLOSED: { label: 'Fechada', variant: 'default' },
    PAID: { label: 'Paga', variant: 'success' },
    OVERDUE: { label: 'Vencida', variant: 'error' },
    CANCELED: { label: 'Cancelada', variant: 'error' },
  };
  const cfg = map[status] ?? { label: status, variant: 'default' };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}
