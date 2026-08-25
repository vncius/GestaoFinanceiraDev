import { getDb } from '../persistence/mongo-client';

// Remove dos documentos gravados os campos de limite de faturamento, período
// de controle e Nota Fiscal (E4 do refactor de contas PF/PJ) — o código já
// não os lê, mas eles continuavam salvos em registros gravados antes desta
// versão. `$unset` de um campo ausente é um no-op seguro, então esta função
// pode rodar em todo boot sem custo relevante depois da primeira vez.
export async function migrateRemoveLimitsAndNotaFiscal(): Promise<void> {
  const db = getDb();

  const settingsResult = await db.collection('settings').updateMany(
    {},
    {
      $unset: {
        minimumMainBalance: '',
        annualRevenueLimit: '',
        controlStartMonth: '',
        controlStartYear: '',
        pjLimitControlEnabled: '',
      },
    },
  );
  if (settingsResult.modifiedCount > 0) {
    console.log(`[migration] Removidos campos de limite/período de ${settingsResult.modifiedCount} configuração(ões).`);
  }

  // A categoria "Nota Fiscal" (antes protected: true) vira uma categoria
  // comum — o código não distingue mais nenhuma categoria por esse campo.
  const categoriesResult = await db.collection('categories').updateMany(
    {},
    { $unset: { protected: '' } },
  );
  if (categoriesResult.modifiedCount > 0) {
    console.log(`[migration] Removido campo "protected" de ${categoriesResult.modifiedCount} categoria(s).`);
  }
}
