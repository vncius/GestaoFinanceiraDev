import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.categories;

router.get('/', asyncHandler((req, res) => controller.findAll(req, res)));
router.get('/:id', asyncHandler((req, res) => controller.findById(req, res)));
router.post('/', asyncHandler((req, res) => controller.create(req, res)));
router.put('/:id', asyncHandler((req, res) => controller.update(req, res)));
router.delete('/:id', asyncHandler((req, res) => controller.delete(req, res)));

export default router;
