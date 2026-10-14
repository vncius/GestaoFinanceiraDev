import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import { TransferModal } from './TransferModal';
import { DialogProvider } from '../../../contexts/DialogContext';
import { TransferFlowItem } from '../../../types';

const accounts = [
  { id: 'pf', name: 'Pessoal', active: true },
  { id: 'pj', name: 'Empresa', active: true },
  { id: 'rs', name: 'Reserva', active: true },
] as never;

describe('TransferModal — edição', () => {
  it('usa a conta da própria perna, não a última conta selecionada (visão "Todas as contas")', () => {
    const item: TransferFlowItem = {
      id: 'leg', transferGroupId: 'g', accountId: 'pj', direction: 'OUT', description: 'Pró-labore',
      amount: 600000, expectedDate: '2026-10-06T12:00:00.000Z', actualDate: null, status: 'PENDING',
      notes: null, counterpartAccountId: 'rs', counterpartAccountName: 'Reserva', isAutoReserve: false,
    };
    const onSave = vi.fn();
    render(
      <DialogProvider>
        <TransferModal open onClose={() => {}} item={item} accountId="pf" accounts={accounts} month={10} year={2026} onSave={onSave} isSaving={false} />
      </DialogProvider>,
    );
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sourceAccountId: 'pj', targetAccountId: 'rs' }));
  });
});
