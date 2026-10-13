// Execução avulsa da migração de conta pagadora dos cartões (U2), para rodar
// contra um banco sem esperar o próximo boot do servidor. Respeita
// MONGODB_URI / MONGODB_DB_NAME do ambiente. Idempotente.
// `--dry-run` só lista o que mudaria, sem gravar.
import 'dotenv/config';
import { connectMongo, closeMongo } from '../shared/persistence/mongo-client';
import { migrateCardPaymentAccount } from '../shared/migrations/migrate-card-payment-account';

async function main() {
  await connectMongo();
  try {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`[migration] Banco: ${process.env.MONGODB_DB_NAME ?? 'gestao_financeira'}${dryRun ? ' (dry-run)' : ''}`);
    await migrateCardPaymentAccount({ dryRun });
    console.log('[migration] Conta pagadora dos cartões: concluído.');
  } finally {
    await closeMongo();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
