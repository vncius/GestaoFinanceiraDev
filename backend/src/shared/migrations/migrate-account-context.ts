import { getDb } from '../persistence/mongo-client';
import { nowISO } from '../utils/date.utils';

// E5 do refactor de contas PF/PJ: cada conta vira o contexto financeiro do
// fluxo de caixa, e settings.mainAccountId deixa de existir. Antes de apagar
// o campo, faz o backfill de qualquer FinancialTransaction sem nenhuma conta
// vinculada (sourceAccountId E targetAccountId nulos) usando o mainAccountId
// legado daquele tenant — só assim o histórico não perde a conta de origem.
// D6: nunca houve transferência e createTransaction sempre preenchia
// sourceAccountId a partir do mainAccountId, então o esperado é 0 registros
// órfãos (backfill vira no-op) — mas o script confere de qualquer forma.
//
// Idempotente: roda em todo boot. O backfill só encontra candidatos
// enquanto settings.mainAccountId ainda existir no documento (por isso
// precisa rodar ANTES do $unset, dentro da mesma função); depois do unset,
// tanto o backfill quanto o unset viram no-op.
export async function migrateAccountContext(): Promise<void> {
  const db = getDb();

  const settingsDocs = await db
    .collection('settings')
    .find({}, { projection: { _id: 0, tenantId: 1, mainAccountId: 1 } })
    .toArray();

  const now = nowISO();

  for (const doc of settingsDocs) {
    const tenantId = doc.tenantId as string;
    const mainAccountId = doc.mainAccountId as string | null | undefined;
    if (!mainAccountId) continue;

    const orphans = await db
      .collection('financial_transactions')
      .find(
        { tenantId, sourceAccountId: null, targetAccountId: null },
        { projection: { _id: 0, id: 1, type: 1 } },
      )
      .toArray();
    if (orphans.length === 0) continue;

    console.log(`[migration] Preenchendo conta em ${orphans.length} lançamento(s) órfão(s) do tenant ${tenantId}...`);

    for (const orphan of orphans) {
      const field = orphan.type === 'INCOME' ? 'targetAccountId' : 'sourceAccountId';
      await db.collection('financial_transactions').updateOne(
        { tenantId, id: orphan.id },
        { $set: { [field]: mainAccountId, updatedAt: now } },
      );
    }
  }

  const unsetResult = await db.collection('settings').updateMany({}, { $unset: { mainAccountId: '' } });
  if (unsetResult.modifiedCount > 0) {
    console.log(`[migration] Removido mainAccountId de ${unsetResult.modifiedCount} configuração(ões).`);
  }
}
