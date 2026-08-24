import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.cashFlow;

// resumo mensal
router.get('/', asyncHandler((req, res) => controller.getCashFlow(req, res)));

// entradas
router.post('/income', asyncHandler((req, res) => controller.createIncome(req, res)));
router.put('/income/:id', asyncHandler((req, res) => controller.updateIncome(req, res)));
router.delete('/income/:id', asyncHandler((req, res) => controller.deleteIncome(req, res)));
router.post('/income/:id/receive', asyncHandler((req, res) => controller.receiveIncome(req, res)));
router.post('/income/:id/revert', asyncHandler((req, res) => controller.revertIncome(req, res)));

// pagamentos
router.post('/payments', asyncHandler((req, res) => controller.createPayment(req, res)));
router.put('/payments/:id', asyncHandler((req, res) => controller.updatePayment(req, res)));
router.delete('/payments/:id', asyncHandler((req, res) => controller.deletePayment(req, res)));
router.post('/payments/:id/pay', asyncHandler((req, res) => controller.payPayment(req, res)));
router.post('/payments/:id/revert', asyncHandler((req, res) => controller.revertPayment(req, res)));

// gastos extraordinários
router.post('/extra-expenses', asyncHandler((req, res) => controller.createExtraExpense(req, res)));
router.put('/extra-expenses/:id', asyncHandler((req, res) => controller.updateExtraExpense(req, res)));
router.delete('/extra-expenses/:id', asyncHandler((req, res) => controller.deleteExtraExpense(req, res)));
router.post('/extra-expenses/:id/pay', asyncHandler((req, res) => controller.payExtraExpense(req, res)));
router.post('/extra-expenses/:id/revert', asyncHandler((req, res) => controller.revertExtraExpense(req, res)));

export default router;
