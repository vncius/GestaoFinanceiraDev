import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';
import { destructiveLimiter, importLimiter } from '../../shared/middlewares/rate-limits';

const router = Router();
const controller = controllers.backup;

router.get('/export', asyncHandler((req, res) => controller.exportBackup(req, res)));
router.post('/import', importLimiter, asyncHandler((req, res) => controller.importBackup(req, res)));
router.post('/reset', destructiveLimiter, asyncHandler((req, res) => controller.resetAccount(req, res)));
router.get('/export-csv', asyncHandler((req, res) => controller.exportCsv(req, res)));
router.post('/statement/parse', importLimiter, asyncHandler((req, res) => controller.parseStatement(req, res)));
router.post('/statement/import', importLimiter, asyncHandler((req, res) => controller.importStatement(req, res)));

export default router;
