import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
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

    // As duas pernas nascem já efetivadas (D5): uma transferência entre
    // contas próprias representa um movimento que já aconteceu, não uma
    // obrigação futura a pagar/receber depois.
    const outgoing = await this.transactionsRepo.create({
      ...base,
      id: generateId(),
      status: TransactionStatus.PAID,
      actualDate: input.date,
      sourceAccountId: input.sourceAccountId,
      targetAccountId: null,
    });
    const incoming = await this.transactionsRepo.create({
      ...base,
      id: generateId(),
      status: TransactionStatus.RECEIVED,
      actualDate: input.date,
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
      // Ambas as pernas nascem efetivadas; mudar a data também move a
      // data de efetivação para manter os dois campos consistentes.
      if (outgoing.actualDate !== null) sharedPatch.actualDate = input.date;
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
      (t) => t.type === TransactionType.TRANSFER,
    );
    const outgoing = legs.find((t) => t.sourceAccountId !== null);
    const incoming = legs.find((t) => t.targetAccountId !== null);
    if (!outgoing || !incoming) return;
    if (!this.isSettled(outgoing) || !this.isSettled(incoming)) return;
    await this.setLegsPending(outgoing, incoming, tenantId);
  }

  // Reaplica a reserva ligada a uma entrada: cria o par na primeira vez;
  // numa entrada recebida -> revertida -> recebida de novo, reconfirma o par
  // já existente (com valor/data atualizados) em vez de duplicar.
  async resettleByOrigin(
    tenantId: string,
    originId: string,
    input: { sourceAccountId: string; targetAccountId: string; amount: number; date: string; description: string },
  ): Promise<TransferPair> {
    const legs = (await this.transactionsRepo.findByOrigin(tenantId, OriginType.AUTO_RESERVE, originId)).filter(
      (t) => t.type === TransactionType.TRANSFER,
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
