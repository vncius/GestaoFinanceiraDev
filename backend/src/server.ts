import 'dotenv/config';
import app from './app';
import { connectMongo } from './shared/persistence/mongo-client';
import { migrateLegacyAccountConfig } from './shared/migrations/migrate-legacy-account-config';
import { migrateRemoveLimitsAndNotaFiscal } from './shared/migrations/migrate-remove-limits-and-nf';
import { migrateAccountContext } from './shared/migrations/migrate-account-context';
import { migrateResetAutoReserve } from './shared/migrations/migrate-reset-auto-reserve';
import { migrateCardPaymentAccount } from './shared/migrations/migrate-card-payment-account';
import { migrateEncryptFields } from './shared/migrations/migrate-encrypt-fields';
import { assertEncryptionConfigured } from './shared/crypto/field-crypto';
import { assertSessionSecretConfigured } from './modules/auth/auth.service';

const PORT = Number(process.env.PORT) || 3100;

async function bootstrap() {
  // Antes de tudo: produção sem ENCRYPTION_KEY (ou com chave inválida) ou com
  // JWT_SECRET fraca não sobe.
  assertEncryptionConfigured();
  assertSessionSecretConfigured();
  await connectMongo();

  await migrateLegacyAccountConfig();
  await migrateRemoveLimitsAndNotaFiscal();
  await migrateAccountContext();
  await migrateResetAutoReserve();
  await migrateCardPaymentAccount();
  await migrateEncryptFields();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Erro ao inicializar:', err);
  process.exit(1);
});

export default app;
