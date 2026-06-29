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
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
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
export function receivableStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    EXPECTED: { label: 'Previsto', variant: 'info' },
    RECEIVED: { label: 'Recebido', variant: 'success' },
    CANCELED: { label: 'Cancelado', variant: 'error' },
  };
  const cfg = map[status] ?? { label: status, variant: 'default' };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}

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
