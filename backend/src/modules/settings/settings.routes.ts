import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { SettingsFileRepository } from './settings.file-repository';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

const router = Router();
const controller = new SettingsController(new SettingsService(new SettingsFileRepository()));

router.get('/', asyncHandler((req, res) => controller.get(req, res)));
router.put('/', asyncHandler((req, res) => controller.update(req, res)));

export default router;
