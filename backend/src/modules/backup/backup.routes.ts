import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.backup;

router.get('/export', asyncHandler((req, res) => controller.exportBackup(req, res)));
router.post('/import', asyncHandler((req, res) => controller.importBackup(req, res)));
router.get('/export-csv', asyncHandler((req, res) => controller.exportCsv(req, res)));
router.post('/statement/parse', asyncHandler((req, res) => controller.parseStatement(req, res)));
router.post('/statement/import', asyncHandler((req, res) => controller.importStatement(req, res)));

export default router;
