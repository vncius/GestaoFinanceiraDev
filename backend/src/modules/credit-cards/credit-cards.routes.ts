import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { CreditCardsFileRepository } from './credit-cards.file-repository';
import { CreditCardEntriesFileRepository } from './credit-cards.file-repository';
import { CreditCardInstallmentsFileRepository } from './credit-cards.file-repository';
import { CreditCardInvoicesFileRepository } from './credit-cards.file-repository';
import { FinancialTransactionsFileRepository } from '../financial-transactions/financial-transactions.file-repository';
import { SettingsFileRepository } from '../settings/settings.file-repository';
import { CreditCardsService } from './credit-cards.service';
import { CreditCardsController } from './credit-cards.controller';

const router = Router();

const controller = new CreditCardsController(
  new CreditCardsService(
    new CreditCardsFileRepository(),
    new CreditCardEntriesFileRepository(),
    new CreditCardInstallmentsFileRepository(),
    new CreditCardInvoicesFileRepository(),
    new FinancialTransactionsFileRepository(),
    new SettingsFileRepository(),
  ),
);

// cards CRUD
router.get('/', asyncHandler((req, res) => controller.findAll(req, res)));
router.post('/', asyncHandler((req, res) => controller.create(req, res)));
router.put('/:id', asyncHandler((req, res) => controller.update(req, res)));
router.delete('/:id', asyncHandler((req, res) => controller.remove(req, res)));

// card flow
router.get('/:id/flow', asyncHandler((req, res) => controller.getCardFlow(req, res)));

// entries
router.post('/:id/entries', asyncHandler((req, res) => controller.createEntry(req, res)));
router.put('/:id/entries/:entryId', asyncHandler((req, res) => controller.updateEntry(req, res)));
router.delete('/:id/entries/:entryId', asyncHandler((req, res) => controller.deleteEntry(req, res)));

// invoices
router.post('/:id/invoices/:invoiceId/pay', asyncHandler((req, res) => controller.payInvoice(req, res)));
router.post('/:id/invoices/:invoiceId/revert', asyncHandler((req, res) => controller.revertInvoice(req, res)));

export default router;
