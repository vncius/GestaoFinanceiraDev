// Wiring central de repositórios/serviços/controllers. Cada *.routes.ts
// importa os controllers já montados aqui em vez de reinstanciar (e
// reimportar) os mesmos repositórios de arquivo em cada módulo.

import { AccountsFileRepository } from './modules/accounts/accounts.file-repository';
import { CategoriesFileRepository } from './modules/categories/categories.file-repository';
import { SettingsFileRepository } from './modules/settings/settings.file-repository';
import { ReceivablesFileRepository } from './modules/receivables/receivables.file-repository';
import { FinancialTransactionsFileRepository } from './modules/financial-transactions/financial-transactions.file-repository';
import {
  CreditCardsFileRepository,
  CreditCardEntriesFileRepository,
  CreditCardInstallmentsFileRepository,
  CreditCardInvoicesFileRepository,
} from './modules/credit-cards/credit-cards.file-repository';

import { AccountsService } from './modules/accounts/accounts.service';
import { CategoriesService } from './modules/categories/categories.service';
import { SettingsService } from './modules/settings/settings.service';
import { ReceivablesService } from './modules/receivables/receivables.service';
import { CreditCardsService } from './modules/credit-cards/credit-cards.service';
import { CashFlowService } from './modules/cash-flow/cash-flow.service';
import { DashboardService } from './modules/dashboard/dashboard.service';

import { AccountsController } from './modules/accounts/accounts.controller';
import { CategoriesController } from './modules/categories/categories.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { ReceivablesController } from './modules/receivables/receivables.controller';
import { CreditCardsController } from './modules/credit-cards/credit-cards.controller';
import { CashFlowController } from './modules/cash-flow/cash-flow.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';

// ─── Repositórios (uma instância por arquivo de dados) ─────────────────────────

const accountsRepo = new AccountsFileRepository();
const categoriesRepo = new CategoriesFileRepository();
const settingsRepo = new SettingsFileRepository();
const receivablesRepo = new ReceivablesFileRepository();
const transactionsRepo = new FinancialTransactionsFileRepository();
const creditCardsRepo = new CreditCardsFileRepository();
const creditCardEntriesRepo = new CreditCardEntriesFileRepository();
const creditCardInstallmentsRepo = new CreditCardInstallmentsFileRepository();
const creditCardInvoicesRepo = new CreditCardInvoicesFileRepository();

// ─── Serviços ───────────────────────────────────────────────────────────────────

const accountsService = new AccountsService(accountsRepo);
const categoriesService = new CategoriesService(categoriesRepo);
const settingsService = new SettingsService(settingsRepo, categoriesRepo);
const receivablesService = new ReceivablesService(
  receivablesRepo,
  transactionsRepo,
  settingsRepo,
);
const creditCardsService = new CreditCardsService(
  creditCardsRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
  creditCardInvoicesRepo,
  transactionsRepo,
  settingsRepo,
);
const cashFlowService = new CashFlowService(
  receivablesRepo,
  transactionsRepo,
  accountsRepo,
  settingsRepo,
  creditCardInvoicesRepo,
);
const dashboardService = new DashboardService(
  receivablesRepo,
  transactionsRepo,
  accountsRepo,
  settingsRepo,
  creditCardsRepo,
  creditCardInvoicesRepo,
  cashFlowService,
  categoriesRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
);

// ─── Controllers ──────────────────────────────────────────────────────────────

export const controllers = {
  accounts: new AccountsController(accountsService),
  categories: new CategoriesController(categoriesService),
  settings: new SettingsController(settingsService),
  receivables: new ReceivablesController(receivablesService),
  creditCards: new CreditCardsController(creditCardsService),
  cashFlow: new CashFlowController(cashFlowService),
  dashboard: new DashboardController(dashboardService),
};
