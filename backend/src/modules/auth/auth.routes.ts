import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.auth;

router.post('/google', asyncHandler((req, res) => controller.google(req, res)));
router.post('/apple', asyncHandler((req, res) => controller.apple(req, res)));
router.get('/me', asyncHandler((req, res) => controller.me(req, res)));
router.post('/logout', asyncHandler((req, res) => controller.logout(req, res)));

export default router;
