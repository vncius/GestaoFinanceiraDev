import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { ReceivablesFileRepository } from '../receivables/receivables.file-repository';
import { FinancialTransactionsFileRepository } from '../financial-transactions/financial-transactions.file-repository';
import { AccountsFileRepository } from '../accounts/accounts.file-repository';
import { SettingsFileRepository } from '../settings/settings.file-repository';
import { CreditCardsFileRepository } from '../credit-cards/credit-cards.file-repository';
import { CreditCardInvoicesFileRepository } from '../credit-cards/credit-cards.file-repository';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

const router = Router();

const controller = new DashboardController(
  new DashboardService(
    new ReceivablesFileRepository(),
    new FinancialTransactionsFileRepository(),
    new AccountsFileRepository(),
    new SettingsFileRepository(),
    new CreditCardsFileRepository(),
    new CreditCardInvoicesFileRepository(),
  ),
);

router.get('/', asyncHandler((req, res) => controller.getDashboard(req, res)));

export default router;
