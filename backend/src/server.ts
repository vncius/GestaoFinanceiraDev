import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { errorHandler } from './shared/middlewares/error-handler';
import { requestLogger } from './shared/middlewares/request-logger';
import { tenantMiddleware } from './shared/middlewares/tenant.middleware';
import {
  migrateLegacyAccountConfig,
  migrateLegacyReceivableReserves,
} from './shared/migrations/migrate-legacy-account-config';
import accountsRouter from './modules/accounts/accounts.routes';
import accountTypesRouter from './modules/account-types/account-types.routes';
import categoriesRouter from './modules/categories/categories.routes';
import settingsRouter from './modules/settings/settings.routes';
import receivablesRouter from './modules/receivables/receivables.routes';
import cashFlowRouter from './modules/cash-flow/cash-flow.routes';
import creditCardsRouter from './modules/credit-cards/credit-cards.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';
import backupRouter from './modules/backup/backup.routes';

const app = express();
const PORT = process.env.PORT ?? 3100;

// Origem do frontend Vite. Configurável via env para deploys fora de
// localhost; em dev aponta para a porta padrão definida em vite.config.ts.
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3101';

app.use(cors({ origin: CORS_ORIGIN }));
// Limite maior que o default (100kb) porque a restauração de backup e a
// importação de extrato mandam o dataset completo/arquivo no corpo da requisição.
app.use(express.json({ limit: '20mb' }));
app.use(requestLogger);
app.use(tenantMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/accounts', accountsRouter);
app.use('/account-types', accountTypesRouter);
app.use('/categories', categoriesRouter);
app.use('/settings', settingsRouter);
app.use('/receivables', receivablesRouter);
app.use('/cash-flow', cashFlowRouter);
app.use('/credit-cards', creditCardsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/backup', backupRouter);

app.use(errorHandler);

async function bootstrap() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  console.log(`[data] Diretório de dados: ${dataDir}`);

  await migrateLegacyAccountConfig();
  await migrateLegacyReceivableReserves();

  app.listen(PORT, () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Erro ao inicializar:', err);
  process.exit(1);
});

export default app;
