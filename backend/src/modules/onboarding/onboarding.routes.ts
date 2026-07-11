import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler';
import { createRateLimiter } from '../../shared/middlewares/rate-limit.middleware';
import { controllers } from '../../container';

const router = Router();
const controller = controllers.onboarding;

// Limites da rota de chat (ADR de segurança em docs/architecture/ai-security.md):
// curto prazo evita rajadas; diário limita o custo por tenant mesmo com uso
// espalhado ao longo do dia. Em memória — vale para o processo único atual.
const shortWindowLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  code: 'onboarding.messages.rateLimited',
});
const dailyLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  code: 'onboarding.messages.dailyLimitExceeded',
});

router.get('/status', asyncHandler((req, res) => controller.getStatus(req, res)));
router.post('/skip', asyncHandler((req, res) => controller.skip(req, res)));
router.post('/complete-manual', asyncHandler((req, res) => controller.completeManual(req, res)));
router.get('/conversation', asyncHandler((req, res) => controller.getConversation(req, res)));
router.post(
  '/messages',
  shortWindowLimiter,
  dailyLimiter,
  asyncHandler((req, res) => controller.postMessage(req, res)),
);
router.post('/confirm', asyncHandler((req, res) => controller.confirm(req, res)));
router.get('/draft', asyncHandler((req, res) => controller.getDraft(req, res)));
router.post('/draft/items', asyncHandler((req, res) => controller.addDraftItem(req, res)));
router.put('/draft/items/:draftItemId', asyncHandler((req, res) => controller.updateDraftItem(req, res)));
router.delete('/draft/items/:draftItemId', asyncHandler((req, res) => controller.removeDraftItem(req, res)));

export default router;
