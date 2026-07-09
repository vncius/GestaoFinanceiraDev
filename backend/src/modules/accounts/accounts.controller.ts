import { Request, Response } from 'express';
import { AccountsService } from './accounts.service';
import { createAccountSchema, updateAccountSchema } from './accounts.schemas';

export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  async findAll(req: Request, res: Response): Promise<void> {
    const accounts = await this.service.findAll(req.tenantId);
    res.json(accounts);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const account = await this.service.findById(req.params.id, req.tenantId);
    res.json(account);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createAccountSchema.parse(req.body);
    const account = await this.service.create(req.tenantId, input);
    res.status(201).json(account);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateAccountSchema.parse(req.body);
    const account = await this.service.update(req.params.id, input, req.tenantId);
    res.json(account);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await this.service.delete(req.params.id, req.tenantId);
    res.status(204).send();
  }
}
