import { getDb } from '../persistence/mongo-client';

// Reserva automática vira transferência (E8 do refactor de contas PF/PJ): a
// flag inverteu de sentido — antes marcava a conta de DESTINO da reserva,
// agora marca a conta de ORIGEM (que precisa também de
// autoReserveTargetAccountId, campo novo). Não há dado antigo para inferir o
// destino automaticamente (D4b), então toda configuração existente é zerada;
// o usuário reconfigura manualmente pela tela de Contas.
//
// Roda em todo boot, então o reset só pode tocar documentos no formato
// pré-E8 — os que ainda não têm autoReserveTargetAccountId. Sem esse filtro,
// toda regra configurada depois da E8 (enabled + destino) era zerada a cada
// reinício do servidor.
export async function migrateResetAutoReserve(): Promise<void> {
  const db = getDb();

  const flagsResult = await db.collection('accounts').updateMany(
    {
      autoReserveTargetAccountId: { $exists: false },
      $or: [{ autoReserveEnabled: true }, { autoReservePercentage: { $gt: 0 } }],
    },
    { $set: { autoReserveEnabled: false, autoReservePercentage: 0, autoReserveTargetAccountId: null } },
  );
  if (flagsResult.modifiedCount > 0) {
    console.log(`[migration] Reserva automática zerada em ${flagsResult.modifiedCount} conta(s) (E8 — reconfigurar manualmente).`);
  }

  const targetResult = await db.collection('accounts').updateMany(
    { autoReserveTargetAccountId: { $exists: false } },
    { $set: { autoReserveTargetAccountId: null } },
  );
  if (targetResult.modifiedCount > 0) {
    console.log(`[migration] Campo autoReserveTargetAccountId inicializado em ${targetResult.modifiedCount} conta(s).`);
  }
}
