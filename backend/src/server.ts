import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { errorHandler } from './shared/middlewares/error-handler';
import accountsRouter from './modules/accounts/accounts.routes';
import categoriesRouter from './modules/categories/categories.routes';
import settingsRouter from './modules/settings/settings.routes';
import receivablesRouter from './modules/receivables/receivables.routes';
import cashFlowRouter from './modules/cash-flow/cash-flow.routes';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/accounts', accountsRouter);
app.use('/categories', categoriesRouter);
app.use('/settings', settingsRouter);
app.use('/receivables', receivablesRouter);
app.use('/cash-flow', cashFlowRouter);

app.use(errorHandler);

async function bootstrap() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  console.log(`[data] Diretório de dados: ${dataDir}`);

  app.listen(PORT, () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Erro ao inicializar:', err);
  process.exit(1);
});

export default app;
