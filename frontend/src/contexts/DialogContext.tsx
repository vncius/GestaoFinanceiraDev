import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

interface AlertOptions {
  title?: string;
}

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogState {
  kind: 'alert' | 'confirm';
  message: string;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: boolean) => void;
}

interface DialogContextValue {
  alert: (message: string, opts?: AlertOptions) => Promise<void>;
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogState | null>(null);
  const queueRef = useRef<DialogState[]>([]);

  const showNext = useCallback(() => {
    setCurrent(queueRef.current.shift() ?? null);
  }, []);

  const enqueue = useCallback((state: DialogState) => {
    queueRef.current.push(state);
    setCurrent((c) => (c ? c : (queueRef.current.shift() ?? null)));
  }, []);

  const alert = useCallback(
    (message: string, opts?: AlertOptions) =>
      new Promise<void>((resolve) => {
        enqueue({
          kind: 'alert',
          message,
          title: opts?.title ?? 'Atenção',
          resolve: () => resolve(),
        });
      }),
    [enqueue],
  );

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          kind: 'confirm',
          message,
          title: opts?.title ?? 'Confirmação',
          confirmLabel: opts?.confirmLabel ?? 'Confirmar',
          cancelLabel: opts?.cancelLabel ?? 'Cancelar',
          resolve,
        });
      }),
    [enqueue],
  );

  function handleClose(result: boolean) {
    current?.resolve(result);
    showNext();
  }

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      <Modal
        open={!!current}
        onClose={() => handleClose(false)}
        title={current?.title ?? ''}
        size="sm"
        footer={
          current?.kind === 'confirm' ? (
            <>
              <Button variant="secondary" onClick={() => handleClose(false)}>
                {current.cancelLabel}
              </Button>
              <Button onClick={() => handleClose(true)}>{current.confirmLabel}</Button>
            </>
          ) : (
            <Button onClick={() => handleClose(true)}>OK</Button>
          )
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
          {current?.message}
        </p>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
}
