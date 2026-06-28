import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { AccountsFileRepository } from './accounts.file-repository';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

const router = Router();
const controller = new AccountsController(new AccountsService(new AccountsFileRepository()));

router.get('/', asyncHandler((req, res) => controller.findAll(req, res)));
router.get('/:id', asyncHandler((req, res) => controller.findById(req, res)));
router.post('/', asyncHandler((req, res) => controller.create(req, res)));
router.put('/:id', asyncHandler((req, res) => controller.update(req, res)));
router.delete('/:id', asyncHandler((req, res) => controller.delete(req, res)));

export default router;
