import { useState } from 'react';
import { Account } from '../../types';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onConfirm: (accountId: string) => void;
  isPaying: boolean;
}

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  MAIN: 'Principal',
  EMERGENCY_RESERVE: 'Reserva de Emergência',
  INVESTMENT: 'Investimentos',
  OTHER: 'Outra',
};

export function PayInvoiceAccountModal({ open, onClose, accounts, onConfirm, isPaying }: Props) {
  const activeAccounts = accounts.filter((a) => a.active);
  const [accountId, setAccountId] = useState('');

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setAccountId(activeAccounts[0]?.id ?? '');
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pagar Fatura"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            loading={isPaying}
            disabled={!accountId}
            onClick={() => accountId && onConfirm(accountId)}
          >
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          Conta para débito
        </label>
        <select
          className={INPUT}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({ACCOUNT_TYPE_LABELS[a.type] ?? a.type})
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
