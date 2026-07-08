import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.settings;

router.get('/', asyncHandler((req, res) => controller.get(req, res)));
router.put('/', asyncHandler((req, res) => controller.update(req, res)));

export default router;
