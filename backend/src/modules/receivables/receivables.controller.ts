import { Request, Response } from 'express';
import { ReceivablesService } from './receivables.service';
import {
  createReceivableSchema,
  updateReceivableSchema,
  receivableQuerySchema,
  receiveActionSchema,
  deleteReceivableQuerySchema,
} from './receivables.schemas';

export class ReceivablesController {
  constructor(private readonly service: ReceivablesService) {}

  async findAll(req: Request, res: Response): Promise<void> {
    const query = receivableQuerySchema.parse(req.query);
    const receivables = await this.service.findAll(query);
    res.json(receivables);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const receivable = await this.service.findById(req.params.id);
    res.json(receivable);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createReceivableSchema.parse(req.body);
    const receivable = await this.service.create(input);
    res.status(201).json(receivable);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateReceivableSchema.parse(req.body);
    const receivable = await this.service.update(req.params.id, input);
    res.json(receivable);
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteReceivableQuerySchema.parse(req.query);
    await this.service.delete(req.params.id, scope, month, year);
    res.status(204).send();
  }

  async receive(req: Request, res: Response): Promise<void> {
    const input = receiveActionSchema.parse(req.body);
    const receivable = await this.service.receive(req.params.id, input);
    res.json(receivable);
  }

  async revert(req: Request, res: Response): Promise<void> {
    const receivable = await this.service.revert(req.params.id);
    res.json(receivable);
  }
}
