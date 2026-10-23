// Wiring central de repositórios/serviços/controllers. Cada *.routes.ts
// importa os controllers já montados aqui em vez de reinstanciar (e
// reimportar) os mesmos repositórios de arquivo em cada módulo.

import { UsersMongoRepository } from './modules/auth/users.mongo-repository';
import { AuditLogMongoRepository } from './modules/audit-log/audit-log.mongo-repository';
import { AccountsMongoRepository } from './modules/accounts/accounts.mongo-repository';
import { AccountTypesMongoRepository } from './modules/account-types/account-types.mongo-repository';
import { CategoriesMongoRepository } from './modules/categories/categories.mongo-repository';
import { SettingsMongoRepository } from './modules/settings/settings.mongo-repository';
import { FinancialTransactionsMongoRepository } from './modules/financial-transactions/financial-transactions.mongo-repository';
import {
  CreditCardsMongoRepository,
  CreditCardEntriesMongoRepository,
  CreditCardInstallmentsMongoRepository,
  CreditCardInvoicesMongoRepository,
} from './modules/credit-cards/credit-cards.mongo-repository';
import {
  OnboardingStateMongoRepository,
  OnboardingMessagesMongoRepository,
} from './modules/onboarding/onboarding.mongo-repository';

import { loadAiConfig } from './modules/ai/ai.config';
import { createAiProvider } from './modules/ai/create-ai-provider';

import { AuthService } from './modules/auth/auth.service';
import { AuditLogService } from './modules/audit-log/audit-log.service';
import { AccountsService } from './modules/accounts/accounts.service';
import { AccountTypesService } from './modules/account-types/account-types.service';
import { CategoriesService } from './modules/categories/categories.service';
import { SettingsService } from './modules/settings/settings.service';
import { CreditCardsService } from './modules/credit-cards/credit-cards.service';
import { CreditCardInvoiceImportService } from './modules/credit-cards/credit-card-invoice-import.service';
import { CashFlowService } from './modules/cash-flow/cash-flow.service';
import { TransfersService } from './modules/transfers/transfers.service';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { BackupService } from './modules/backup/backup.service';
import { OnboardingService } from './modules/onboarding/onboarding.service';
import { OnboardingDraftService } from './modules/onboarding/onboarding-draft.service';
import { createOnboardingToolRegistry } from './modules/onboarding/onboarding-tools';
import { OnboardingContextService } from './modules/onboarding/onboarding-context.service';
import { OnboardingConversationService } from './modules/onboarding/onboarding-conversation.service';
import { OnboardingApplyService } from './modules/onboarding/onboarding-apply.service';
import { TenantBootstrapService } from './modules/tenant-bootstrap/tenant-bootstrap.service';

import { AuthController } from './modules/auth/auth.controller';
import { AccountDeletionService } from './modules/auth/account-deletion.service';
import { AccountsController } from './modules/accounts/accounts.controller';
import { AccountTypesController } from './modules/account-types/account-types.controller';
import { CategoriesController } from './modules/categories/categories.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { CreditCardsController } from './modules/credit-cards/credit-cards.controller';
import { CreditCardInvoiceImportController } from './modules/credit-cards/credit-card-invoice-import.controller';
import { CashFlowController } from './modules/cash-flow/cash-flow.controller';
import { TransfersController } from './modules/transfers/transfers.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { BackupController } from './modules/backup/backup.controller';
import { OnboardingController } from './modules/onboarding/onboarding.controller';

// ─── Repositórios (uma instância por coleção do MongoDB) ────────────────────────

const usersRepo = new UsersMongoRepository();
const auditLogRepo = new AuditLogMongoRepository();
const accountsRepo = new AccountsMongoRepository();
const accountTypesRepo = new AccountTypesMongoRepository();
const categoriesRepo = new CategoriesMongoRepository();
const settingsRepo = new SettingsMongoRepository();
const transactionsRepo = new FinancialTransactionsMongoRepository();
const creditCardsRepo = new CreditCardsMongoRepository();
const creditCardEntriesRepo = new CreditCardEntriesMongoRepository();
const creditCardInstallmentsRepo = new CreditCardInstallmentsMongoRepository();
const creditCardInvoicesRepo = new CreditCardInvoicesMongoRepository();
const onboardingStateRepo = new OnboardingStateMongoRepository();
const onboardingMessagesRepo = new OnboardingMessagesMongoRepository();

// ─── Plataforma de IA (ADR 0002) ────────────────────────────────────────────────

export const aiConfig = loadAiConfig();
export const aiProvider = createAiProvider(aiConfig);

// ─── Serviços ───────────────────────────────────────────────────────────────────

export const auditLogService = new AuditLogService(auditLogRepo);
const accountsService = new AccountsService(accountsRepo, creditCardsRepo);
const accountTypesService = new AccountTypesService(accountTypesRepo);
const categoriesService = new CategoriesService(categoriesRepo);
const settingsService = new SettingsService(settingsRepo);
const tenantBootstrapService = new TenantBootstrapService(
  accountTypesService,
  accountsService,
  categoriesService,
);
export const authService = new AuthService(usersRepo);
const creditCardsService = new CreditCardsService(
  creditCardsRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
  creditCardInvoicesRepo,
  transactionsRepo,
  categoriesRepo,
  accountsRepo,
);
const creditCardInvoiceImportService = new CreditCardInvoiceImportService(
  creditCardsService,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
  creditCardInvoicesRepo,
  categoriesRepo,
  aiProvider,
  aiConfig,
);
const transfersService = new TransfersService(transactionsRepo, accountsRepo);
const cashFlowService = new CashFlowService(
  transactionsRepo,
  accountsRepo,
  creditCardInvoicesRepo,
  creditCardsRepo,
  transfersService,
  categoriesRepo,
);
const dashboardService = new DashboardService(
  cashFlowService,
  categoriesRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
);
const backupService = new BackupService(
  accountsRepo,
  accountTypesRepo,
  categoriesRepo,
  settingsRepo,
  transactionsRepo,
  creditCardsRepo,
  creditCardEntriesRepo,
  creditCardInstallmentsRepo,
  creditCardInvoicesRepo,
  onboardingStateRepo,
  onboardingMessagesRepo,
);

const onboardingService = new OnboardingService(
  onboardingStateRepo,
  onboardingMessagesRepo,
  accountsRepo,
  tenantBootstrapService,
);
const onboardingDraftService = new OnboardingDraftService(onboardingService, onboardingStateRepo);
export const onboardingToolRegistry = createOnboardingToolRegistry({
  onboardingService,
  draftService: onboardingDraftService,
  accountsRepo,
  categoriesRepo,
});
const onboardingApplyService = new OnboardingApplyService(onboardingService, onboardingStateRepo, {
  accountTypesService,
  accountsService,
  categoriesService,
  settingsService,
  creditCardsService,
  cashFlowService,
  transfersService,
  accountTypesRepo,
  accountsRepo,
  categoriesRepo,
  creditCardsRepo,
});
const onboardingConversationService = new OnboardingConversationService(
  aiProvider,
  aiConfig,
  onboardingToolRegistry,
  onboardingService,
  new OnboardingContextService(),
  onboardingStateRepo,
  onboardingMessagesRepo,
);

// ─── Controllers ──────────────────────────────────────────────────────────────

export const controllers = {
  auth: new AuthController(
    authService,
    auditLogService,
    new AccountDeletionService(backupService, usersRepo, auditLogRepo, authService),
  ),
  accounts: new AccountsController(accountsService),
  accountTypes: new AccountTypesController(accountTypesService),
  categories: new CategoriesController(categoriesService),
  settings: new SettingsController(settingsService),
  creditCards: new CreditCardsController(creditCardsService),
  creditCardInvoiceImport: new CreditCardInvoiceImportController(creditCardInvoiceImportService),
  cashFlow: new CashFlowController(cashFlowService),
  transfers: new TransfersController(transfersService),
  dashboard: new DashboardController(dashboardService),
  backup: new BackupController(backupService),
  onboarding: new OnboardingController(
    onboardingService,
    onboardingDraftService,
    onboardingConversationService,
    onboardingApplyService,
  ),
};
