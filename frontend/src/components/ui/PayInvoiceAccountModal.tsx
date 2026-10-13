import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types';
import { Modal } from './Modal';
import { Button } from './Button';
import { sortByName } from '../../utils/sort';

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onConfirm: (accountId: string) => void;
  isPaying: boolean;
  // Conta sugerida (a da tela / a pagadora do cartão).
  defaultAccountId?: string | null;
}

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export function PayInvoiceAccountModal({ open, onClose, accounts, onConfirm, isPaying, defaultAccountId }: Props) {
  const { t } = useTranslation('common');
  const activeAccounts = sortByName(accounts.filter((a) => a.active));
  const [accountId, setAccountId] = useState('');

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setAccountId(activeAccounts.find((a) => a.id === defaultAccountId)?.id ?? activeAccounts[0]?.id ?? '');
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('payInvoiceModal.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('payInvoiceModal.cancel')}</Button>
          <Button
            loading={isPaying}
            disabled={!accountId}
            onClick={() => accountId && onConfirm(accountId)}
          >
            {t('payInvoiceModal.confirm')}
          </Button>
        </>
      }
    >
      {/* Uma conta só: não há o que escolher (U16 — divulgação progressiva). */}
      {activeAccounts.length === 1 ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('payInvoiceModal.singleAccount', { account: activeAccounts[0].name })}
        </p>
      ) : (
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('payInvoiceModal.accountLabel')}
        </label>
        <select
          className={INPUT}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">{t('payInvoiceModal.selectPlaceholder')}</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      )}
    </Modal>
  );
}
