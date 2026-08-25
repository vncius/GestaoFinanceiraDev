import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.transfers;

router.post('/', asyncHandler((req, res) => controller.createTransfer(req, res)));
router.put('/:transferGroupId', asyncHandler((req, res) => controller.updateTransfer(req, res)));
router.delete('/:transferGroupId', asyncHandler((req, res) => controller.deleteTransfer(req, res)));
router.post('/:transferGroupId/revert', asyncHandler((req, res) => controller.revertTransfer(req, res)));

export default router;
