import { ReactNode } from 'react';
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" loading={loading} onClick={onDeleteCurrent}>
            Somente esta referência
          </Button>
          <Button loading={loading} onClick={onDeleteFuture}>
            Esta e as futuras
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
    </Modal>
  );
}
