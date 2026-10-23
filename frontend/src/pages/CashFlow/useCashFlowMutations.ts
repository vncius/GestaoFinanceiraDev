import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CashFlowService, CreateIncomePayload, CreateTransactionPayload } from '../../services/cash-flow.service';
import { CreditCardsService } from '../../services/credit-cards.service';
import { CreateTransferPayload, TransfersService } from '../../services/transfers.service';

type ScopedDeleteVars = {
  id: string;
  scope?: 'CURRENT' | 'CURRENT_AND_FUTURE';
  month?: number;
  year?: number;
};

type ScopedUpdateVars<TData> = {
  id: string;
  data: TData;
  scope?: 'CURRENT' | 'CURRENT_AND_FUTURE';
  month?: number;
  year?: number;
};

// Centraliza as ~14 mutations da página de Fluxo de Caixa (entradas,
// pagamentos, gastos extraordinários e faturas de cartão), todas
// invalidando a mesma query key ao final.
export function useCashFlowMutations({
  accountId,
  month,
  year,
  closeModal,
  clearFixedDeleteTarget,
  clearInvoicePayTarget,
}: {
  accountId: string;
  month: number;
  year: number;
  closeModal: () => void;
  clearFixedDeleteTarget: () => void;
  clearInvoicePayTarget: () => void;
}) {
  const qc = useQueryClient();

  // Invalida por PREFIXO (`['cashFlow']`), nunca pela chave completa da
  // referência ativa. Motivo: quase toda mutação daqui pode atingir outros
  // meses — marcar um lançamento como fixo, editar/excluir com escopo
  // CURRENT_AND_FUTURE, transferências e faturas pagas por outra conta.
  // Como o backend materializa a recorrência de forma preguiçosa
  // (`ensureFixedTransactions`, que só roda no GET do mês alvo), um mês
  // futuro já presente no cache nunca era refetchado e o lançamento fixo só
  // aparecia depois de um F5.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cashFlow'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['invoiceTax'] });
  };

  // Uma transferência toca duas contas — mesmo alcance do invalidate acima,
  // que já cobre todas as contas e referências.
  const invalidateTransfer = invalidate;

  // ── Income mutations ─────────────────────────────────────────────────────────
  const createIncome = useMutation({
    mutationFn: (payload: CreateIncomePayload) => CashFlowService.createIncome(accountId, payload),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateIncome = useMutation({
    mutationFn: ({ id, data, scope, month: m, year: y }: ScopedUpdateVars<Partial<CreateIncomePayload>>) =>
      CashFlowService.updateIncome(id, data, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const receiveItem = useMutation({
    mutationFn: (id: string) => CashFlowService.receiveIncome(id),
    onSuccess: invalidate,
  });
  const revertIncome = useMutation({
    mutationFn: CashFlowService.revertIncome,
    onSuccess: invalidate,
  });
  const deleteIncome = useMutation({
    mutationFn: ({ id, scope, month: m, year: y }: ScopedDeleteVars) =>
      CashFlowService.deleteIncome(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); clearFixedDeleteTarget(); },
  });

  // ── Payment mutations ────────────────────────────────────────────────────────
  const createPayment = useMutation({
    mutationFn: (payload: CreateTransactionPayload) => CashFlowService.createPayment(accountId, payload),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updatePayment = useMutation({
    mutationFn: ({ id, data, scope, month: m, year: y }: ScopedUpdateVars<Partial<CreateTransactionPayload>>) =>
      CashFlowService.updatePayment(id, data, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const payPayment = useMutation({
    mutationFn: (id: string) => CashFlowService.payPayment(id),
    onSuccess: invalidate,
  });
  // Baixa do "Imposto a pagar" com o valor real do DAS (A5).
  const payInvoiceTax = useMutation({
    mutationFn: ({ id, amountPaid }: { id: string; amountPaid: number }) =>
      CashFlowService.payPayment(id, { amountPaid }),
    onSuccess: invalidate,
  });
  const revertPayment = useMutation({
    mutationFn: CashFlowService.revertPayment,
    onSuccess: invalidate,
  });
  const deletePayment = useMutation({
    mutationFn: ({ id, scope, month: m, year: y }: ScopedDeleteVars) =>
      CashFlowService.deletePayment(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); clearFixedDeleteTarget(); },
  });

  // ── Extra expense mutations ──────────────────────────────────────────────────
  const createExtra = useMutation({
    mutationFn: (payload: CreateTransactionPayload) => CashFlowService.createExtraExpense(accountId, payload),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateExtra = useMutation({
    mutationFn: ({ id, data, scope, month: m, year: y }: ScopedUpdateVars<Partial<CreateTransactionPayload>>) =>
      CashFlowService.updateExtraExpense(id, data, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const payExtra = useMutation({
    mutationFn: (id: string) => CashFlowService.payExtraExpense(id),
    onSuccess: invalidate,
  });
  const revertExtra = useMutation({
    mutationFn: CashFlowService.revertExtraExpense,
    onSuccess: invalidate,
  });
  const deleteExtra = useMutation({
    mutationFn: ({ id, scope, month: m, year: y }: ScopedDeleteVars) =>
      CashFlowService.deleteExtraExpense(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); clearFixedDeleteTarget(); },
  });

  // ── Invoice mutations ────────────────────────────────────────────────────────
  // O pagamento de fatura pode ser debitado de uma conta diferente da ativa
  // (o modal deixa escolher livremente) — invalida como uma transferência,
  // com prefixo amplo, para não deixar o fluxo de caixa da conta pagadora
  // com dados desatualizados.
  const payInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId, accountId }: { cardId: string; invoiceId: string; accountId?: string }) =>
      CreditCardsService.payInvoice(cardId, invoiceId, accountId ? { paymentAccountId: accountId } : undefined),
    onSuccess: () => { invalidateTransfer(); clearInvoicePayTarget(); },
  });
  const revertInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId }: { cardId: string; invoiceId: string }) =>
      CreditCardsService.revertInvoice(cardId, invoiceId),
    onSuccess: invalidateTransfer,
  });

  // ── Transfer mutations ───────────────────────────────────────────────────────
  const createTransfer = useMutation({
    mutationFn: (payload: CreateTransferPayload) => TransfersService.create(payload),
    onSuccess: () => { invalidateTransfer(); closeModal(); },
  });
  const updateTransfer = useMutation({
    mutationFn: ({ transferGroupId, data }: { transferGroupId: string; data: Partial<CreateTransferPayload> }) =>
      TransfersService.update(transferGroupId, data),
    onSuccess: () => { invalidateTransfer(); closeModal(); },
  });
  const settleTransfer = useMutation({
    mutationFn: (transferGroupId: string) => TransfersService.settle(transferGroupId),
    onSuccess: invalidateTransfer,
  });
  const revertTransfer = useMutation({
    mutationFn: (transferGroupId: string) => TransfersService.revert(transferGroupId),
    onSuccess: invalidateTransfer,
  });
  const deleteTransfer = useMutation({
    mutationFn: (transferGroupId: string) => TransfersService.remove(transferGroupId),
    onSuccess: invalidateTransfer,
  });

  return {
    createIncome,
    updateIncome,
    receiveItem,
    revertIncome,
    deleteIncome,
    createPayment,
    updatePayment,
    payPayment,
    payInvoiceTax,
    revertPayment,
    deletePayment,
    createExtra,
    updateExtra,
    payExtra,
    revertExtra,
    deleteExtra,
    payInvoice,
    revertInvoice,
    createTransfer,
    updateTransfer,
    settleTransfer,
    revertTransfer,
    deleteTransfer,
  };
}
