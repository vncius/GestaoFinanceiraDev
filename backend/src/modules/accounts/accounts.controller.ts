import { Request, Response } from 'express';
import { AccountsService } from './accounts.service';
import { createAccountSchema, updateAccountSchema } from './accounts.schemas';

export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  async findAll(_req: Request, res: Response): Promise<void> {
    const accounts = await this.service.findAll();
    res.json(accounts);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const account = await this.service.findById(req.params.id);
    res.json(account);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createAccountSchema.parse(req.body);
    const account = await this.service.create(input);
    res.status(201).json(account);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateAccountSchema.parse(req.body);
    const account = await this.service.update(req.params.id, input);
    res.json(account);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await this.service.delete(req.params.id);
    res.status(204).send();
  }
}
