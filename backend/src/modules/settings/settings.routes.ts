import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { SettingsFileRepository } from './settings.file-repository';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { CategoriesFileRepository } from '../categories/categories.file-repository';

const router = Router();
const controller = new SettingsController(
  new SettingsService(new SettingsFileRepository(), new CategoriesFileRepository()),
);

router.get('/', asyncHandler((req, res) => controller.get(req, res)));
router.put('/', asyncHandler((req, res) => controller.update(req, res)));

export default router;
