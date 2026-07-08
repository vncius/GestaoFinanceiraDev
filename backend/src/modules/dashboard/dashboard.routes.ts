import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.dashboard;

router.get('/', asyncHandler((req, res) => controller.getDashboard(req, res)));

export default router;
