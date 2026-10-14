import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { controllers } from '../../container';
import { loginLimiter } from '../../shared/middlewares/rate-limits';

const router = Router();
const controller = controllers.auth;

router.post('/google', loginLimiter, asyncHandler((req, res) => controller.google(req, res)));
router.get('/me', asyncHandler((req, res) => controller.me(req, res)));
router.post('/logout', asyncHandler((req, res) => controller.logout(req, res)));
router.post('/logout-all', asyncHandler((req, res) => controller.logoutAll(req, res)));

export default router;
