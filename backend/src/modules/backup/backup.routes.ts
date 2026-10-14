import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { auditLogService, controllers } from '../../container';
import { createAuditAction } from '../../shared/middlewares/audit.middleware';
import { destructiveLimiter, importLimiter } from '../../shared/middlewares/rate-limits';

const router = Router();
const controller = controllers.backup;
const audit = createAuditAction(auditLogService);

router.get('/export', audit('backup_exported'), asyncHandler((req, res) => controller.exportBackup(req, res)));
router.post('/import', importLimiter, audit('backup_imported'), asyncHandler((req, res) => controller.importBackup(req, res)));
router.post('/reset', destructiveLimiter, audit('data_reset'), asyncHandler((req, res) => controller.resetAccount(req, res)));
router.get('/export-csv', audit('csv_exported'), asyncHandler((req, res) => controller.exportCsv(req, res)));
router.post('/statement/parse', importLimiter, asyncHandler((req, res) => controller.parseStatement(req, res)));
router.post('/statement/import', importLimiter, audit('statement_imported'), asyncHandler((req, res) => controller.importStatement(req, res)));

export default router;
