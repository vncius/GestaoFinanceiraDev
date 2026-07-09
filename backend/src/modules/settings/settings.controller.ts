import { Request, Response } from 'express';
import { SettingsService } from './settings.service';
import { updateSettingsSchema } from './settings.schemas';

export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  async get(req: Request, res: Response): Promise<void> {
    const settings = await this.service.get(req.tenantId);
    res.json(settings);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateSettingsSchema.parse(req.body);
    const settings = await this.service.update(req.tenantId, input);
    res.json(settings);
  }
}
