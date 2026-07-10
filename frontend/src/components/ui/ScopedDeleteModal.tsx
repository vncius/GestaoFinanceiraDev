import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';

interface ScopedDeleteModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  onDeleteCurrent: () => void;
  onDeleteFuture: () => void;
  loading?: boolean;
}

export function ScopedDeleteModal({
  open,
  onClose,
  title,
  description,
  onDeleteCurrent,
  onDeleteFuture,
  loading = false,
}: ScopedDeleteModalProps) {
  const { t } = useTranslation('common');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('scopedDelete.cancel')}
          </Button>
          <Button variant="secondary" loading={loading} onClick={onDeleteCurrent}>
            {t('scopedDelete.currentOnly')}
          </Button>
          <Button loading={loading} onClick={onDeleteFuture}>
            {t('scopedDelete.currentAndFuture')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
    </Modal>
  );
}
