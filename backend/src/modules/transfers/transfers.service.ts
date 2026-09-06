import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO, toDateOnly } from '../../shared/utils/date.utils';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  OriginType,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import { AccountsRepository } from '../accounts/accounts.repository';
import { CreateTransferInput, UpdateTransferInput } from './transfers.schemas';
import { TransferPair } from './transfers.types';

export class TransfersService {
  constructor(
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly accountsRepo: AccountsRepository,
  ) {}

  async createTransfer(tenantId: string, input: CreateTransferInput): Promise<TransferPair> {
    await this.assertDifferentActiveAccounts(tenantId, input.sourceAccountId, input.targetAccountId);
    return this.createTransferPair(tenantId, {
      ...input,
      originType: OriginType.TRANSFER,
      originId: null,
    });
  }

  // Reserva automática (E8): mesma mecânica de par de transações, mas
  // originada pelo recebimento de uma entrada (originType/originId ligam de
  // volta a ela para o cascade de reversão em applyAutoReserve/cascadeRevertForOrigin).
  // Não valida contas aqui — quem decide se a regra é aplicável é o chamador
  // (CashFlowService), que já leu a conta de origem para calcular o valor.
  async createAutoReserveTransfer(
    tenantId: string,
    input: {
      sourceAccountId: string;
      targetAccountId: string;
      amount: number;
      date: string;
      description: string;
      originId: string;
    },
  ): Promise<TransferPair> {
    return this.createTransferPair(tenantId, {
      ...input,
      notes: null,
      originType: OriginType.AUTO_RESERVE,
      originId: input.originId,
      settled: true,
    });
  }

  private async createTransferPair(
    tenantId: string,
    input: {
      sourceAccountId: string;
      targetAccountId: string;
      amount: number;
      date: string;
      description: string;
      notes?: string | null;
      originType: OriginType;
      originId: string | null;
      // Força o par a nascer efetivado independente da data — usado pela
      // reserva automática, que deriva de uma entrada já recebida.
      settled?: boolean;
    },
  ): Promise<TransferPair> {
    const now = nowISO();
    const transferGroupId = generateId();
    const base = {
      tenantId,
      type: TransactionType.TRANSFER,
      description: input.description,
      categoryId: null,
      amount: input.amount,
      expectedDate: input.date,
      originType: input.originType,
      originId: input.originId,
      transferGroupId,
      notes: input.notes ?? null,
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    };

    // Com data de hoje ou passada as duas pernas nascem já efetivadas (D5):
    // uma transferência entre contas próprias representa um movimento que já
    // aconteceu. Com data futura é uma programação — nasce PREVISTA (PENDING
    // nas duas pernas), fica fora dos saldos realizados e só entra neles
    // quando o usuário a efetiva pelo joinha (settleTransfer).
    const settled = input.settled ?? !this.isScheduledForFuture(input.date);
    const outgoing = await this.transactionsRepo.create({
      ...base,
      id: generateId(),
      status: settled ? TransactionStatus.PAID : TransactionStatus.PENDING,
      actualDate: settled ? input.date : null,
      sourceAccountId: input.sourceAccountId,
      targetAccountId: null,
    });
    const incoming = await this.transactionsRepo.create({
      ...base,
      id: generateId(),
      status: settled ? TransactionStatus.RECEIVED : TransactionStatus.PENDING,
      actualDate: settled ? input.date : null,
      sourceAccountId: null,
      targetAccountId: input.targetAccountId,
    });

    return { transferGroupId, outgoing, incoming };
  }

  async updateTransfer(transferGroupId: string, tenantId: string, input: UpdateTransferInput): Promise<TransferPair> {
    const [outgoing, incoming] = await this.getLegsChecked(transferGroupId, tenantId);

    const nextSourceAccountId = input.sourceAccountId ?? outgoing.sourceAccountId!;
    const nextTargetAccountId = input.targetAccountId ?? incoming.targetAccountId!;
    if (input.sourceAccountId || input.targetAccountId) {
      await this.assertDifferentActiveAccounts(tenantId, nextSourceAccountId, nextTargetAccountId);
    }

    const now = nowISO();
    const sharedPatch: Partial<FinancialTransaction> = { updatedAt: now };
    if (input.description !== undefined) sharedPatch.description = input.description;
    if (input.amount !== undefined) sharedPatch.amount = input.amount;
    if (input.notes !== undefined) sharedPatch.notes = input.notes ?? null;
    if (input.date !== undefined) {
      sharedPatch.expectedDate = input.date;
      if (this.isScheduledForFuture(input.date)) {
        // Empurrar a transferência para o futuro a devolve à condição de
        // prevista nas duas pontas — senão o valor continuaria pesando no
        // saldo realizado de um movimento que ainda não aconteceu.
        sharedPatch.status = TransactionStatus.PENDING;
        sharedPatch.actualDate = null;
      } else if (outgoing.actualDate !== null) {
        // Já efetivada: mover a data também move a data de efetivação,
        // mantendo os dois campos consistentes.
        sharedPatch.actualDate = input.date;
      }
    }

    const updatedOutgoing = await this.transactionsRepo.update(
      outgoing.id,
      { ...sharedPatch, sourceAccountId: nextSourceAccountId },
      tenantId,
    );
    const updatedIncoming = await this.transactionsRepo.update(
      incoming.id,
      { ...sharedPatch, targetAccountId: nextTargetAccountId },
      tenantId,
    );

    return { transferGroupId, outgoing: updatedOutgoing, incoming: updatedIncoming };
  }

  async deleteTransfer(transferGroupId: string, tenantId: string): Promise<void> {
    const legs = await this.getLegsChecked(transferGroupId, tenantId);
    if (legs.some((leg) => leg.status !== TransactionStatus.PENDING)) {
      throw new AppError(
        'Transferências já efetivadas não podem ser excluídas. Reverta primeiro.',
        400,
        'transfer.settledCannotDelete',
      );
    }

    const now = nowISO();
    for (const leg of legs) {
      await this.transactionsRepo.update(leg.id, { status: TransactionStatus.CANCELED, updatedAt: now }, tenantId);
    }
  }

  // Efetivação pelo joinha, espelhando payPayment/receiveIncome: as duas
  // pernas passam a PAID/RECEIVED na mesma operação, para que origem e
  // destino nunca fiquem com status divergentes.
  async settleTransfer(transferGroupId: string, tenantId: string, actualDate?: string): Promise<TransferPair> {
    const [outgoing, incoming] = await this.getLegsChecked(transferGroupId, tenantId);
    if (this.isSettled(outgoing) && this.isSettled(incoming)) {
      throw new AppError('Transferência já foi efetivada.', 400, 'transfer.alreadySettled');
    }

    const now = nowISO();
    const effectiveDate = actualDate ?? outgoing.expectedDate;
    const updatedOutgoing = await this.transactionsRepo.update(
      outgoing.id,
      { status: TransactionStatus.PAID, expectedDate: effectiveDate, actualDate: now, updatedAt: now },
      tenantId,
    );
    const updatedIncoming = await this.transactionsRepo.update(
      incoming.id,
      { status: TransactionStatus.RECEIVED, expectedDate: effectiveDate, actualDate: now, updatedAt: now },
      tenantId,
    );
    return { transferGroupId, outgoing: updatedOutgoing, incoming: updatedIncoming };
  }

  async revertTransfer(transferGroupId: string, tenantId: string): Promise<TransferPair> {
    const [outgoing, incoming] = await this.getLegsChecked(transferGroupId, tenantId);
    if (!this.isSettled(outgoing) || !this.isSettled(incoming)) {
      throw new AppError(
        'Apenas transferências efetivadas podem ser revertidas.',
        400,
        'transfer.notSettledCannotRevert',
      );
    }

    const [updatedOutgoing, updatedIncoming] = await this.setLegsPending(outgoing, incoming, tenantId);
    return { transferGroupId, outgoing: updatedOutgoing, incoming: updatedIncoming };
  }

  // ─── Reserva automática (E8) ─────────────────────────────────────────────────

  // Estorno/reversão da entrada que originou a reserva: desfaz a
  // transferência em cascata. Tolerante (nunca lança) — chamado
  // automaticamente pelo CashFlowService, não por uma ação explícita do
  // usuário sobre a própria transferência.
  async cascadeRevertForOrigin(tenantId: string, originId: string): Promise<void> {
    const legs = (await this.transactionsRepo.findByOrigin(tenantId, OriginType.AUTO_RESERVE, originId)).filter(
      (t) => t.type === TransactionType.TRANSFER && t.status !== TransactionStatus.CANCELED,
    );
    const outgoing = legs.find((t) => t.sourceAccountId !== null);
    const incoming = legs.find((t) => t.targetAccountId !== null);
    if (!outgoing || !incoming) return;
    if (!this.isSettled(outgoing) || !this.isSettled(incoming)) return;
    await this.setLegsPending(outgoing, incoming, tenantId);
  }

  // Exclusão da entrada que originou a reserva: cancela as duas pernas em
  // cascata. Sem isso elas sobrariam órfãs — sem origem, previstas para
  // sempre e somando nos previstos dos dois fluxos de caixa. Tolerante
  // (nunca lança), como cascadeRevertForOrigin.
  async cascadeCancelForOrigin(tenantId: string, originId: string): Promise<void> {
    const legs = (await this.transactionsRepo.findByOrigin(tenantId, OriginType.AUTO_RESERVE, originId)).filter(
      (t) => t.type === TransactionType.TRANSFER && t.status !== TransactionStatus.CANCELED,
    );
    const now = nowISO();
    for (const leg of legs) {
      await this.transactionsRepo.update(leg.id, { status: TransactionStatus.CANCELED, updatedAt: now }, tenantId);
    }
  }

  // Reaplica a reserva ligada a uma entrada: cria o par na primeira vez;
  // numa entrada recebida -> revertida -> recebida de novo, reconfirma o par
  // já existente (com valor/data atualizados) em vez de duplicar.
  async resettleByOrigin(
    tenantId: string,
    originId: string,
    input: { sourceAccountId: string; targetAccountId: string; amount: number; date: string; description: string },
  ): Promise<TransferPair> {
    // Pernas canceladas ficam de fora: se o usuário excluiu a reserva, um
    // novo recebimento gera um par novo em vez de ressuscitar o excluído.
    const legs = (await this.transactionsRepo.findByOrigin(tenantId, OriginType.AUTO_RESERVE, originId)).filter(
      (t) => t.type === TransactionType.TRANSFER && t.status !== TransactionStatus.CANCELED,
    );
    const outgoing = legs.find((t) => t.sourceAccountId !== null);
    const incoming = legs.find((t) => t.targetAccountId !== null);
    if (!outgoing || !incoming) {
      return this.createAutoReserveTransfer(tenantId, { ...input, originId });
    }

    const now = nowISO();
    const updatedOutgoing = await this.transactionsRepo.update(
      outgoing.id,
      { status: TransactionStatus.PAID, amount: input.amount, expectedDate: input.date, actualDate: input.date, updatedAt: now },
      tenantId,
    );
    const updatedIncoming = await this.transactionsRepo.update(
      incoming.id,
      { status: TransactionStatus.RECEIVED, amount: input.amount, expectedDate: input.date, actualDate: input.date, updatedAt: now },
      tenantId,
    );
    return { transferGroupId: outgoing.transferGroupId as string, outgoing: updatedOutgoing, incoming: updatedIncoming };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private isSettled(t: FinancialTransaction): boolean {
    return t.status === TransactionStatus.PAID || t.status === TransactionStatus.RECEIVED;
  }

  // Compara só a parte YYYY-MM-DD (como balance.utils) para não sofrer o
  // offset UTC-vs-local: "2026-08-10T00:00:00Z" é 09/08 21:00 em UTC-3 e uma
  // comparação por Date classificaria a data de hoje como passada.
  private isScheduledForFuture(date: string): boolean {
    return toDateOnly(date) > this.todayDateOnly();
  }

  private todayDateOnly(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private async setLegsPending(
    outgoing: FinancialTransaction,
    incoming: FinancialTransaction,
    tenantId: string,
  ): Promise<[FinancialTransaction, FinancialTransaction]> {
    const now = nowISO();
    const updatedOutgoing = await this.transactionsRepo.update(
      outgoing.id,
      { status: TransactionStatus.PENDING, actualDate: null, updatedAt: now },
      tenantId,
    );
    const updatedIncoming = await this.transactionsRepo.update(
      incoming.id,
      { status: TransactionStatus.PENDING, actualDate: null, updatedAt: now },
      tenantId,
    );
    return [updatedOutgoing, updatedIncoming];
  }

  private async assertDifferentActiveAccounts(
    tenantId: string,
    sourceAccountId: string,
    targetAccountId: string,
  ): Promise<void> {
    if (sourceAccountId === targetAccountId) {
      throw new AppError('A conta de origem e destino devem ser diferentes.', 400, 'transfer.sameAccount');
    }
    const [source, target] = await Promise.all([
      this.accountsRepo.findById(sourceAccountId, tenantId),
      this.accountsRepo.findById(targetAccountId, tenantId),
    ]);
    if (!source || !source.active) {
      throw new AppError('Conta de origem não encontrada ou inativa.', 404, 'transfer.sourceAccountNotFound');
    }
    if (!target || !target.active) {
      throw new AppError('Conta de destino não encontrada ou inativa.', 404, 'transfer.targetAccountNotFound');
    }
  }

  private async getLegsChecked(
    transferGroupId: string,
    tenantId: string,
  ): Promise<[FinancialTransaction, FinancialTransaction]> {
    const legs = (await this.transactionsRepo.findByTransferGroup(tenantId, transferGroupId)).filter(
      (t) => t.type === TransactionType.TRANSFER,
    );
    const outgoing = legs.find((t) => t.sourceAccountId !== null);
    const incoming = legs.find((t) => t.targetAccountId !== null);
    if (legs.length !== 2 || !outgoing || !incoming) {
      throw new AppError('Transferência não encontrada.', 404, 'transfer.notFound');
    }
    if (outgoing.status === TransactionStatus.CANCELED || incoming.status === TransactionStatus.CANCELED) {
      throw new AppError('Transferências excluídas não podem ser alteradas.', 400, 'transfer.canceledCannotEdit');
    }
    return [outgoing, incoming];
  }
}
