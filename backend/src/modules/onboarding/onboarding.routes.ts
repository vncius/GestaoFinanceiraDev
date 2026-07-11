import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.onboarding;

router.get('/status', asyncHandler((req, res) => controller.getStatus(req, res)));
router.post('/skip', asyncHandler((req, res) => controller.skip(req, res)));
router.post('/complete-manual', asyncHandler((req, res) => controller.completeManual(req, res)));
router.get('/conversation', asyncHandler((req, res) => controller.getConversation(req, res)));
router.get('/draft', asyncHandler((req, res) => controller.getDraft(req, res)));

export default router;
