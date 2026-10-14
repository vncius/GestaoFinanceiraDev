import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requireCsrfHeader } from './shared/middlewares/csrf.middleware';
import { clientIp, trustProxyHops } from './shared/middlewares/client-ip.middleware';
import { globalIpLimiter } from './shared/middlewares/rate-limits';
import { rejectUnsafeInput } from './shared/middlewares/sanitize-input.middleware';
import { connectMongo } from './shared/persistence/mongo-client';
import { errorHandler } from './shared/middlewares/error-handler';
import { requestLogger } from './shared/middlewares/request-logger';
import { authMiddleware } from './shared/middlewares/auth.middleware';
import { migrateLegacyAccountConfig } from './shared/migrations/migrate-legacy-account-config';
import { migrateRemoveLimitsAndNotaFiscal } from './shared/migrations/migrate-remove-limits-and-nf';
import { migrateAccountContext } from './shared/migrations/migrate-account-context';
import { migrateResetAutoReserve } from './shared/migrations/migrate-reset-auto-reserve';
import { migrateCardPaymentAccount } from './shared/migrations/migrate-card-payment-account';
import authRouter from './modules/auth/auth.routes';
import accountsRouter from './modules/accounts/accounts.routes';
import accountTypesRouter from './modules/account-types/account-types.routes';
import categoriesRouter from './modules/categories/categories.routes';
import settingsRouter from './modules/settings/settings.routes';
import cashFlowRouter from './modules/cash-flow/cash-flow.routes';
import transfersRouter from './modules/transfers/transfers.routes';
import creditCardsRouter from './modules/credit-cards/credit-cards.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';
import backupRouter from './modules/backup/backup.routes';
import onboardingRouter from './modules/onboarding/onboarding.routes';

const app = express();
const PORT = Number(process.env.PORT) || 3100;
// req.ip passa a ser o IP de quem conectou no load balancer do Render, não o
// do próprio load balancer (ver client-ip.middleware.ts).
app.set('trust proxy', trustProxyHops());

// Origem do frontend Vite. Configurável via env para deploys fora de
// localhost; em dev aponta para a porta padrão definida em vite.config.ts.
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3101';

// A API só devolve JSON: CSP fechada (nada é renderizado a partir dela) e os
// demais cabeçalhos padrão do helmet (HSTS, nosniff, sem X-Powered-By…).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
  }),
);
app.use(clientIp);
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
// Depois do cors: um 429 sem cabeçalhos CORS chegaria ao frontend como erro de rede.
app.use(globalIpLimiter);
app.use(requireCsrfHeader);
// Limites de corpo por rota — cada parser específico precisa rodar ANTES do
// global: body-parser pula mensagens já parseadas (req._body), então o
// primeiro que casar com a rota é o que vale.
// Chat do onboarding: apertado.
app.use('/onboarding/messages', express.json({ limit: '16kb' }));
// Restauração de backup e importação de extrato/fatura mandam o dataset
// completo ou o arquivo no corpo.
app.use(
  ['/backup/import', '/backup/statement', '/credit-cards/:id/invoice-import'],
  express.json({ limit: '20mb' }),
);
// Demais rotas: formulários e listas pequenas.
app.use(express.json({ limit: '1mb' }));
app.use(rejectUnsafeInput);
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
app.use('/cash-flow', cashFlowRouter);
app.use('/transfers', transfersRouter);
app.use('/credit-cards', creditCardsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/backup', backupRouter);
app.use('/onboarding', onboardingRouter);

app.use(errorHandler);

async function bootstrap() {
  await connectMongo();

  await migrateLegacyAccountConfig();
  await migrateRemoveLimitsAndNotaFiscal();
  await migrateAccountContext();
  await migrateResetAutoReserve();
  await migrateCardPaymentAccount();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Erro ao inicializar:', err);
  process.exit(1);
});

export default app;
