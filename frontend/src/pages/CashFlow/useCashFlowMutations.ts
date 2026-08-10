import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CashFlowService, CreateTransactionPayload } from '../../services/cash-flow.service';
import { ReceivablesService } from '../../services/receivables.service';
import { CreditCardsService } from '../../services/credit-cards.service';

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

// Centraliza as ~14 mutations da página de Fluxo de Caixa (recebíveis,
// pagamentos, gastos extraordinários e faturas de cartão), todas
// invalidando a mesma query key ao final.
export function useCashFlowMutations({
  month,
  year,
  closeModal,
  clearFixedDeleteTarget,
  clearInvoicePayTarget,
}: {
  month: number;
  year: number;
  closeModal: () => void;
  clearFixedDeleteTarget: () => void;
  clearInvoicePayTarget: () => void;
}) {
  const qc = useQueryClient();
  const cfKey = ['cashFlow', month, year] as const;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: cfKey });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // ── Receivable mutations ─────────────────────────────────────────────────────
  const createReceivable = useMutation({
    mutationFn: ReceivablesService.create,
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateReceivable = useMutation({
    mutationFn: ({ id, data, scope, month: m, year: y }: ScopedUpdateVars<Parameters<typeof ReceivablesService.update>[1]>) =>
      ReceivablesService.update(id, data, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const receiveItem = useMutation({
    mutationFn: (id: string) => ReceivablesService.receive(id),
    onSuccess: invalidate,
  });
  const revertReceivable = useMutation({
    mutationFn: ReceivablesService.revert,
    onSuccess: invalidate,
  });
  const deleteReceivable = useMutation({
    mutationFn: ({ id, scope, month: m, year: y }: ScopedDeleteVars) =>
      ReceivablesService.remove(id, scope ? { scope, month: m!, year: y! } : undefined),
    onSuccess: () => { invalidate(); clearFixedDeleteTarget(); },
  });

  // ── Payment mutations ────────────────────────────────────────────────────────
  const createPayment = useMutation({
    mutationFn: CashFlowService.createPayment,
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
    mutationFn: CashFlowService.createExtraExpense,
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
  const payInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId, accountId }: { cardId: string; invoiceId: string; accountId?: string }) =>
      CreditCardsService.payInvoice(cardId, invoiceId, accountId ? { paymentAccountId: accountId } : undefined),
    onSuccess: () => { invalidate(); clearInvoicePayTarget(); },
  });
  const revertInvoice = useMutation({
    mutationFn: ({ cardId, invoiceId }: { cardId: string; invoiceId: string }) =>
      CreditCardsService.revertInvoice(cardId, invoiceId),
    onSuccess: invalidate,
  });

  return {
    createReceivable,
    updateReceivable,
    receiveItem,
    revertReceivable,
    deleteReceivable,
    createPayment,
    updatePayment,
    payPayment,
    revertPayment,
    deletePayment,
    createExtra,
    updateExtra,
    payExtra,
    revertExtra,
    deleteExtra,
    payInvoice,
    revertInvoice,
  };
}
