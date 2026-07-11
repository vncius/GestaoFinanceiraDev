import { Request, Response } from 'express';
import { OnboardingService } from './onboarding.service';
import { OnboardingDraftService } from './onboarding-draft.service';
import { addDraftItemSchema, updateDraftItemSchema } from './onboarding.schemas';
import { OnboardingState } from './onboarding.types';

// Visão pública do estado: campos internos de idempotência/resumo não saem da API.
function toStatusResponse(state: OnboardingState) {
  return {
    status: state.status,
    language: state.language,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export class OnboardingController {
  constructor(
    private readonly service: OnboardingService,
    private readonly draftService: OnboardingDraftService,
  ) {}

  async getStatus(req: Request, res: Response): Promise<void> {
    const state = await this.service.getState(req.tenantId);
    res.json(toStatusResponse(state));
  }

  async skip(req: Request, res: Response): Promise<void> {
    const state = await this.service.skip(req.tenantId);
    res.json(toStatusResponse(state));
  }

  async completeManual(req: Request, res: Response): Promise<void> {
    const state = await this.service.completeManual(req.tenantId);
    res.json(toStatusResponse(state));
  }

  async getConversation(req: Request, res: Response): Promise<void> {
    const messages = await this.service.getConversation(req.tenantId);
    res.json(messages);
  }

  async getDraft(req: Request, res: Response): Promise<void> {
    const draft = await this.service.getDraft(req.tenantId);
    res.json(draft);
  }

  // Edições manuais do draft (feitas pela UI de revisão) entram como source
  // 'user' — a IA propõe itens por outro caminho (tools), nunca por aqui.

  async addDraftItem(req: Request, res: Response): Promise<void> {
    const input = addDraftItemSchema.parse(req.body);
    const result = await this.draftService.addItem(
      req.tenantId,
      input.section,
      input.payload,
      'user',
    );
    res.status(201).json({ item: result.item, draft: result.state.draft });
  }

  async updateDraftItem(req: Request, res: Response): Promise<void> {
    const input = updateDraftItemSchema.parse(req.body);
    const result = await this.draftService.updateItem(
      req.tenantId,
      req.params.draftItemId,
      input.payload,
      'user',
    );
    res.json({ item: result.item, draft: result.state.draft });
  }

  async removeDraftItem(req: Request, res: Response): Promise<void> {
    const state = await this.draftService.removeItem(req.tenantId, req.params.draftItemId);
    res.json({ draft: state.draft });
  }
}
