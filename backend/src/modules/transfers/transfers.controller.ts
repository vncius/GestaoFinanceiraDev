import { Request, Response } from 'express';
import { TransfersService } from './transfers.service';
import { createTransferSchema, settleTransferSchema, updateTransferSchema } from './transfers.schemas';

export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  async createTransfer(req: Request, res: Response): Promise<void> {
    const input = createTransferSchema.parse(req.body);
    const pair = await this.service.createTransfer(req.tenantId, input);
    res.status(201).json(pair);
  }

  async updateTransfer(req: Request, res: Response): Promise<void> {
    const input = updateTransferSchema.parse(req.body);
    const pair = await this.service.updateTransfer(req.params.transferGroupId, req.tenantId, input);
    res.json(pair);
  }

  async deleteTransfer(req: Request, res: Response): Promise<void> {
    await this.service.deleteTransfer(req.params.transferGroupId, req.tenantId);
    res.status(204).send();
  }

  async settleTransfer(req: Request, res: Response): Promise<void> {
    const input = settleTransferSchema.parse(req.body);
    const pair = await this.service.settleTransfer(req.params.transferGroupId, req.tenantId, input?.actualDate);
    res.json(pair);
  }

  async revertTransfer(req: Request, res: Response): Promise<void> {
    const pair = await this.service.revertTransfer(req.params.transferGroupId, req.tenantId);
    res.json(pair);
  }
}
