import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, LogOut, MonitorSmartphone } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LogoutScope, useAuth } from '../../contexts/AuthContext';

interface LogoutDialogProps {
  open: boolean;
  onClose: () => void;
}

// "Sair" sempre pergunta o alcance (D1 do plano de segurança): só este
// aparelho ou todos os aparelhos em que a pessoa entrou.
export function LogoutDialog({ open, onClose }: LogoutDialogProps) {
  const { t } = useTranslation('layout');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<LogoutScope | null>(null);

  async function handle(scope: LogoutScope) {
    setPending(scope);
    try {
      await logout(scope);
      navigate('/login', { replace: true });
    } finally {
      setPending(null);
    }
  }

  const optionClass =
    'w-full flex items-start gap-3 p-3 text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('logoutDialog.title')}
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose} disabled={pending !== null}>
          {t('logoutDialog.cancel')}
        </Button>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{t('logoutDialog.description')}</p>
      <div className="space-y-2">
        <button
          type="button"
          className={optionClass}
          onClick={() => handle('device')}
          disabled={pending !== null}
          data-testid="logout-device"
        >
          {pending === 'device' ? (
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-gray-500" />
          ) : (
            <LogOut size={18} className="mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" />
          )}
          <span>
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
              {t('logoutDialog.thisDevice')}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{t('logoutDialog.thisDeviceHint')}</span>
          </span>
        </button>
        <button
          type="button"
          className={optionClass}
          onClick={() => handle('all')}
          disabled={pending !== null}
          data-testid="logout-all"
        >
          {pending === 'all' ? (
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-gray-500" />
          ) : (
            <MonitorSmartphone size={18} className="mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" />
          )}
          <span>
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
              {t('logoutDialog.allDevices')}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{t('logoutDialog.allDevicesHint')}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}
