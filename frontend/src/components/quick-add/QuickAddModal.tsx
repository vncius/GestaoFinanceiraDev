import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoriesService } from '../../services/categories.service';
import { CashFlowService } from '../../services/cash-flow.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { invalidateDerivedData } from '../../utils/query-invalidation';
import { CreateTransferPayload, TransfersService } from '../../services/transfers.service';
import { useAccount } from '../../contexts/AccountContext';
import { useMonth } from '../../contexts/MonthContext';
import { MovementModal, MovementSubmit } from '../movement/MovementModal';
import { TransferModal } from '../../pages/CashFlow/components/TransferModal';

// Lançamento rápido do "+ Novo" global e do atalho N. Usa o mesmo formulário
// único de Movimentações (U12); "Transferência entre suas contas" troca para o
// formulário de transferência.
export function QuickAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { accountId, accounts } = useAccount();
  const { month, year } = useMonth();
  const [mode, setMode] = useState<'movement' | 'transfer'>('movement');
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setMode('movement'); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { data: cards = [] } = useQuery({
    queryKey: ['creditCards'],
    queryFn: () => CreditCardsService.findAll(),
    staleTime: 60_000,
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
    staleTime: Infinity,
    enabled: open,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const createMovement = useMutation({
    mutationFn: async (data: MovementSubmit) => {
      if (data.kind === 'card') {
        await CreditCardsService.createEntry(data.cardId, data.payload);
        return;
      }
      if (!accountId) throw new Error('Nenhuma conta selecionada.');
      if (data.kind === 'income') {
        const tx = await CashFlowService.createIncome(accountId, data.payload);
        if (data.settleNow) await CashFlowService.receiveIncome(tx.id);
        return;
      }
      const tx = data.kind === 'payment'
        ? await CashFlowService.createPayment(accountId, data.payload)
        : await CashFlowService.createExtraExpense(accountId, data.payload);
      if (data.settleNow) {
        if (data.kind === 'payment') await CashFlowService.payPayment(tx.id);
        else await CashFlowService.payExtraExpense(tx.id);
      }
    },
    onSuccess: () => { invalidateDerivedData(qc); onClose(); },
  });

  const createTransfer = useMutation({
    mutationFn: (payload: CreateTransferPayload) => TransfersService.create(payload),
    onSuccess: () => { invalidate(); onClose(); },
  });

  if (mode === 'transfer') {
    return (
      <TransferModal
        open={open}
        onClose={onClose}
        accountId={accountId ?? ''}
        accounts={accounts}
        month={month}
        year={year}
        onSave={(payload) => createTransfer.mutate(payload)}
        isSaving={createTransfer.isPending}
      />
    );
  }

  return (
    <MovementModal
      open={open}
      onClose={onClose}
      categories={categories}
      accounts={accounts}
      defaultAccountId={accountId}
      month={month}
      year={year}
      saving={createMovement.isPending}
      onSubmit={(data) => createMovement.mutate(data)}
      // Continua aberto e só troca de formulário.
      onTransfer={() => setMode('transfer')}
      cards={cards}
    />
  );
}
