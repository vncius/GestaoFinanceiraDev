import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, reportMutationError, useToast } from './ToastContext';

function Trigger({ message }: { message: string }) {
  const { showError } = useToast();
  return (
    <button onClick={() => showError(message)}>trigger</button>
  );
}

describe('ToastProvider', () => {
  it('renders an error toast when showError is called', async () => {
    render(
      <ToastProvider>
        <Trigger message="Falha ao salvar" />
      </ToastProvider>,
    );

    screen.getByText('trigger').click();

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar');
  });

  it('lets a mutation-cache callback outside React trigger a toast via reportMutationError', async () => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    );

    reportMutationError('Erro ao conectar com o servidor');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Erro ao conectar com o servidor');
    });
  });

  it('is a no-op when no ToastProvider is mounted yet', () => {
    expect(() => reportMutationError('sem provider')).not.toThrow();
  });
});
