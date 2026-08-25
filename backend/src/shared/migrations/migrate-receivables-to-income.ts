import { ReceivablesRepository } from '../../modules/receivables/receivables.repository';
import { Receivable, ReceivableStatus } from '../../modules/receivables/receivables.types';
import { FinancialTransactionsRepository } from '../../modules/financial-transactions/financial-transactions.repository';
import { OriginType, TransactionStatus, TransactionType } from '../../modules/financial-transactions/financial-transactions.types';
import { SettingsRepository } from '../../modules/settings/settings.repository';
import { nowISO } from '../utils/date.utils';

export interface MigrationRepos {
  receivablesRepo: ReceivablesRepository;
  transactionsRepo: FinancialTransactionsRepository;
  settingsRepo: SettingsRepository;
}

export interface MigrationReport {
  tenantId: string;
  dryRun: boolean;
  totalReceivables: number;
  convertedFromExpected: number;
  alreadyConvertedExpected: number;
  normalizedFromReceived: number;
  alreadyNormalizedReceived: number;
  ignoredCanceled: number;
  nfDataDiscarded: number;
}

function hasNfData(r: Receivable): boolean {
  return !!(
    r.customerName ||
    r.invoiceNumber ||
    r.invoiceCode ||
    r.invoiceLink ||
    r.invoiceIssueDate ||
    r.competence ||
    r.workedHours ||
    r.hourlyRate
  );
}

// Migração única: converte `Receivable` em `FinancialTransaction` tipo INCOME,
// para que o Fluxo de Caixa (E1) passe a enxergar as entradas antigas sem
// depender do módulo Recebimentos (removido em E3).
//
// - RECEIVED já materializou um FinancialTransaction INCOME em `receive()`
//   (linkado via originType/originId RECEIVABLE) — aqui só normaliza:
//   garante targetAccountId preenchido e limpa o link com o Receivable, que
//   está prestes a deixar de existir. O valor permanece líquido (D4b: a
//   RESERVE correspondente fica congelada como histórico, não é tocada nem
//   somada de volta).
// - EXPECTED vira um novo INCOME pendente. Usa `id: r.id` (reaproveitando o id
//   do Receivable) por dois motivos: (1) idempotência trivial — uma segunda
//   execução encontra a transação pelo mesmo id e não duplica; (2) preserva
//   `recurringGroupId` sem remapear nada — receivables de uma mesma série
//   fixa compartilham esse valor, e como todos os EXPECTED da série são
//   migrados com o próprio id, o agrupamento de recorrência continua íntegro
//   do lado do FinancialTransaction.
// - CANCELED é ignorado — nunca teve efeito no saldo, não precisa de destino.
// - Usa grossAmount (não netAmount): a separação automática de reserva não
//   migra (D4b) — a partir de agora, receber esta entrada credita o valor
//   cheio, sem split.
export async function migrateReceivablesToIncome(
  tenantId: string,
  options: { dryRun: boolean },
  { receivablesRepo, transactionsRepo, settingsRepo }: MigrationRepos,
): Promise<MigrationReport> {
  const [receivables, settings] = await Promise.all([
    receivablesRepo.findAll(tenantId),
    settingsRepo.get(tenantId),
  ]);

  const now = nowISO();
  const report: MigrationReport = {
    tenantId,
    dryRun: options.dryRun,
    totalReceivables: receivables.length,
    convertedFromExpected: 0,
    alreadyConvertedExpected: 0,
    normalizedFromReceived: 0,
    alreadyNormalizedReceived: 0,
    ignoredCanceled: 0,
    nfDataDiscarded: 0,
  };

  for (const r of receivables) {
    if (hasNfData(r)) report.nfDataDiscarded += 1;

    if (r.status === ReceivableStatus.CANCELED) {
      report.ignoredCanceled += 1;
      continue;
    }

    if (r.status === ReceivableStatus.RECEIVED) {
      // Um Receivable editado após recebido acumula mais de uma transação
      // INCOME com o mesmo originId (a antiga fica REVERSED, uma nova é
      // criada) — normaliza todas, não só a "primeira" (sem ordem garantida
      // no retorno do Mongo). findByOrigin só retorna quem ainda tem
      // originType RECEIVABLE, então uma lista vazia já significa "nada
      // pendente" (idempotente por construção, sem precisar de outro sinal).
      const linked = await transactionsRepo.findByOrigin(tenantId, OriginType.RECEIVABLE, r.id);
      const incomeTxs = linked.filter((t) => t.type === TransactionType.INCOME);
      if (incomeTxs.length === 0) {
        report.alreadyNormalizedReceived += 1;
        continue;
      }

      report.normalizedFromReceived += 1;
      if (!options.dryRun) {
        for (const incomeTx of incomeTxs) {
          await transactionsRepo.update(
            incomeTx.id,
            {
              targetAccountId: incomeTx.targetAccountId ?? r.targetAccountId ?? settings?.mainAccountId ?? null,
              originType: null,
              originId: null,
              updatedAt: now,
            },
            tenantId,
          );
        }
      }
      continue;
    }

    // EXPECTED
    const existing = await transactionsRepo.findById(r.id, tenantId);
    if (existing) {
      report.alreadyConvertedExpected += 1;
      continue;
    }

    report.convertedFromExpected += 1;
    if (!options.dryRun) {
      await transactionsRepo.create({
        id: r.id,
        tenantId,
        type: TransactionType.INCOME,
        description: r.description,
        categoryId: r.incomeCategoryId,
        amount: r.grossAmount,
        expectedDate: r.expectedPaymentDate,
        actualDate: null,
        status: TransactionStatus.PENDING,
        sourceAccountId: null,
        targetAccountId: r.targetAccountId ?? settings?.mainAccountId ?? null,
        originType: null,
        originId: null,
        notes: r.notes,
        recurrence: r.recurrence,
        recurringGroupId: r.recurringGroupId,
        recurringActive: r.recurringActive,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return report;
}
