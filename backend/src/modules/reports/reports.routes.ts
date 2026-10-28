import { Request, Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { auditLogService, controllers } from '../../container';
import { createAuditAction } from '../../shared/middlewares/audit.middleware';

const router = Router();
const controller = controllers.reports;
const audit = createAuditAction(auditLogService);

// Formato, referência e escopo, nunca valores. A query já foi validada pelo
// controller quando a auditoria grava (só em 2xx).
const statementDetails = (format: string) => (req: Request) => ({
  format,
  month: Number(req.query.month),
  year: Number(req.query.year),
  scope: req.query.accountId ? 'account' : 'all',
});

// JSON da página do relatório (base do PDF impresso pelo navegador).
router.get(
  '/statement',
  audit('statement_exported', statementDetails('json')),
  asyncHandler((req, res) => controller.getStatement(req, res)),
);

export default router;
