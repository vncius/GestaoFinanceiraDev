// Runner de linha de comando para a migração Recebimentos → Entradas (E2 do
// refactor de contas). Por padrão roda em modo dry-run (não escreve nada);
// passe --apply para gravar de fato.
//
//   npm run migrate:receivables-to-income            # dry-run, só relatório
//   npm run migrate:receivables-to-income -- --apply  # aplica as mudanças
import 'dotenv/config';
import { connectMongo, closeMongo, getDb } from '../shared/persistence/mongo-client';
import { migrateReceivablesToIncome, MigrationReport } from '../shared/migrations/migrate-receivables-to-income';
import { ReceivablesMongoRepository } from '../modules/receivables/receivables.mongo-repository';
import { FinancialTransactionsMongoRepository } from '../modules/financial-transactions/financial-transactions.mongo-repository';
import { SettingsMongoRepository } from '../modules/settings/settings.mongo-repository';

function printReport(r: MigrationReport) {
  console.log(`\n— Tenant ${r.tenantId} —`);
  console.log(`  Recebimentos encontrados:        ${r.totalReceivables}`);
  console.log(`  Convertidos (EXPECTED → INCOME):  ${r.convertedFromExpected}`);
  console.log(`  Já convertidos (idempotente):      ${r.alreadyConvertedExpected}`);
  console.log(`  Normalizados (RECEIVED):           ${r.normalizedFromReceived}`);
  console.log(`  Já normalizados (idempotente):      ${r.alreadyNormalizedReceived}`);
  console.log(`  Ignorados (CANCELED):               ${r.ignoredCanceled}`);
  console.log(`  Com dados de NF descartados:        ${r.nfDataDiscarded}`);
}

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log(`\n📦 Migração Recebimentos → Entradas ${dryRun ? '(DRY-RUN — nada será gravado)' : '(APLICANDO MUDANÇAS)'}\n`);

  await connectMongo();
  // `distinct` não faz parte da Stable API v1 (o cliente conecta com apiStrict:
  // true) — busca só o campo tenantId e deduplica em memória.
  const rows = await getDb()
    .collection('receivables')
    .find({}, { projection: { _id: 0, tenantId: 1 } })
    .toArray();
  const tenantIds = [...new Set(rows.map((r) => r.tenantId as string))];

  if (tenantIds.length === 0) {
    console.log('Nenhum recebimento encontrado em nenhum tenant.');
    return;
  }

  const repos = {
    receivablesRepo: new ReceivablesMongoRepository(),
    transactionsRepo: new FinancialTransactionsMongoRepository(),
    settingsRepo: new SettingsMongoRepository(),
  };

  const reports: MigrationReport[] = [];
  for (const tenantId of tenantIds) {
    const report = await migrateReceivablesToIncome(tenantId, { dryRun }, repos);
    reports.push(report);
    printReport(report);
  }

  const totals = reports.reduce(
    (acc, r) => ({
      totalReceivables: acc.totalReceivables + r.totalReceivables,
      convertedFromExpected: acc.convertedFromExpected + r.convertedFromExpected,
      alreadyConvertedExpected: acc.alreadyConvertedExpected + r.alreadyConvertedExpected,
      normalizedFromReceived: acc.normalizedFromReceived + r.normalizedFromReceived,
      alreadyNormalizedReceived: acc.alreadyNormalizedReceived + r.alreadyNormalizedReceived,
      ignoredCanceled: acc.ignoredCanceled + r.ignoredCanceled,
      nfDataDiscarded: acc.nfDataDiscarded + r.nfDataDiscarded,
    }),
    {
      totalReceivables: 0,
      convertedFromExpected: 0,
      alreadyConvertedExpected: 0,
      normalizedFromReceived: 0,
      alreadyNormalizedReceived: 0,
      ignoredCanceled: 0,
      nfDataDiscarded: 0,
    },
  );

  console.log(`\n— Total (${tenantIds.length} tenant(s)) —`);
  console.log(`  Recebimentos encontrados:        ${totals.totalReceivables}`);
  console.log(`  Convertidos (EXPECTED → INCOME):  ${totals.convertedFromExpected}`);
  console.log(`  Já convertidos (idempotente):      ${totals.alreadyConvertedExpected}`);
  console.log(`  Normalizados (RECEIVED):           ${totals.normalizedFromReceived}`);
  console.log(`  Já normalizados (idempotente):      ${totals.alreadyNormalizedReceived}`);
  console.log(`  Ignorados (CANCELED):               ${totals.ignoredCanceled}`);
  console.log(`  Com dados de NF descartados:        ${totals.nfDataDiscarded}`);

  if (dryRun) {
    console.log('\n✅ Dry-run concluído. Rode novamente com --apply para gravar.\n');
  } else {
    console.log('\n✅ Migração aplicada!\n');
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Erro na migração:', err);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
