// Wiring central de repositórios/serviços/controllers. Cada *.routes.ts
// importa os controllers já montados aqui em vez de reinstanciar (e
// reimportar) os mesmos repositórios de arquivo em cada módulo.

import { AccountsMongoRepository } from './modules/accounts/accounts.mongo-repository';
import { AccountTypesMongoRepository } from './modules/account-types/account-types.mongo-repository';
import { CategoriesMongoRepository } from './modules/categories/categories.mongo-repository';
import { SettingsMongoRepository } from './modules/settings/settings.mongo-repository';
import { ReceivablesMongoRepository } from './modules/receivables/receivables.mongo-repository';
import { FinancialTransactionsMongoRepository } from './modules/financial-transactions/financial-transactions.mongo-repository';
import {
  CreditCardsMongoRepository,
  CreditCardEntriesMongoRepository,
  CreditCardInstallmentsMongoRepository,
  CreditCardInvoicesMongoRepository,
} from './modules/credit-cards/credit-cards.mongo-repository';

import { AccountsService } from './modules/accounts/accounts.service';
import { AccountTypesService } from './modules/account-types/account-types.service';
import { CategoriesService } from './modules/categories/categories.service';
import { SettingsService } from './modules/settings/settings.service';
import { ReceivablesService } from './modules/receivables/receivables.service';
import { CreditCardsService } from './modules/credit-cards/credit-cards.service';
import { CashFlowService } from './modules/cash-flow/cash-flow.service';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { BackupService } from './modules/backup/backup.service';

import { AccountsController } from './modules/accounts/accounts.controller';
import { AccountTypesController } from './modules/account-types/account-types.controller';
import { CategoriesController } from './modules/categories/categories.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { ReceivablesController } from './modules/receivables/receivables.controller';
import { CreditCardsController } from './modules/credit-cards/credit-cards.controller';
import { CashFlowController } from './modules/cash-flow/cash-flow.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { BackupController } from './modules/backup/backup.controller';

// ─── Repositórios (uma instância por coleção do MongoDB) ────────────────────────

const accountsRepo = new AccountsMongoRepository();
const accountTypesRepo = new AccountTypesMongoRepository();
const categoriesRepo = new CategoriesMongoRepository();
const settingsRepo = new SettingsMongoRepository();
const receivablesRepo = new ReceivablesMongoRepository();
const transactionsRepo = new FinancialTransactionsMongoRepository();
const creditCardsRepo = new CreditCardsMongoRepository();
const creditCardEntriesRepo = new CreditCardEntriesMongoRepository();
const creditCardInstallmentsRepo = new CreditCardInstallmentsMongoRepository();
const creditCardInvoicesRepo = new CreditCardInvoicesMongoRepository();

// ─── Serviços ───────────────────────────────────────────────────────────────────

const accountsService = new AccountsService(accountsRepo);
const accountTypesService = new AccountTypesService(accountTypesRepo);
const categoriesService = new CategoriesService(categoriesRepo);
const settingsService = new SettingsService(settingsRepo, categoriesRepo);
const receivablesService = new ReceivablesService(
  receivablesRepo,
  transactionsRepo,
  settingsRepo,
  accountsRepo,
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
const backupService = new BackupService(
  accountsRepo,
  categoriesRepo,
  settingsRepo,
  receivablesRepo,
  transactionsRepo,
  creditCardsRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
  creditCardInvoicesRepo,
);

// ─── Controllers ──────────────────────────────────────────────────────────────

export const controllers = {
  accounts: new AccountsController(accountsService),
  accountTypes: new AccountTypesController(accountTypesService),
  categories: new CategoriesController(categoriesService),
  settings: new SettingsController(settingsService),
  receivables: new ReceivablesController(receivablesService),
  creditCards: new CreditCardsController(creditCardsService),
  cashFlow: new CashFlowController(cashFlowService),
  dashboard: new DashboardController(dashboardService),
  backup: new BackupController(backupService),
};
