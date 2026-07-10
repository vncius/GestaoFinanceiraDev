import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectMongo } from './shared/persistence/mongo-client';
import { errorHandler } from './shared/middlewares/error-handler';
import { requestLogger } from './shared/middlewares/request-logger';
import { authMiddleware } from './shared/middlewares/auth.middleware';
import {
  migrateLegacyAccountConfig,
  migrateLegacyReceivableReserves,
} from './shared/migrations/migrate-legacy-account-config';
import authRouter from './modules/auth/auth.routes';
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

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
// Limite maior que o default (100kb) porque a restauração de backup e a
// importação de extrato mandam o dataset completo/arquivo no corpo da requisição.
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Rotas de login ficam antes do authMiddleware — são o único jeito de
// conseguir uma sessão. Tudo montado depois dele exige cookie válido.
app.use('/auth', authRouter);
app.use(authMiddleware);

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
  await connectMongo();

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
