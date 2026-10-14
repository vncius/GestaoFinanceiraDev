import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';
import { importLimiter } from '../../shared/middlewares/rate-limits';

const router = Router();
const controller = controllers.creditCards;
const invoiceImportController = controllers.creditCardInvoiceImport;

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

// importação de fatura via OFX
router.post('/:id/invoice-import/parse', importLimiter, asyncHandler((req, res) => invoiceImportController.parse(req, res)));
router.post('/:id/invoice-import/confirm', importLimiter, asyncHandler((req, res) => invoiceImportController.confirm(req, res)));

export default router;
