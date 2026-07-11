import { Request, Response } from 'express';
import { OnboardingService } from './onboarding.service';
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
  constructor(private readonly service: OnboardingService) {}

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
}
