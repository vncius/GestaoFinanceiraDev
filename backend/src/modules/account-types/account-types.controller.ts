import { Request, Response } from 'express';
import { AccountTypesService } from './account-types.service';
import { createAccountTypeSchema, updateAccountTypeSchema } from './account-types.schemas';

export class AccountTypesController {
  constructor(private readonly service: AccountTypesService) {}

  async findAll(req: Request, res: Response): Promise<void> {
    const accountTypes = await this.service.findAll(req.tenantId);
    res.json(accountTypes);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const accountType = await this.service.findById(req.params.id, req.tenantId);
    res.json(accountType);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createAccountTypeSchema.parse(req.body);
    const accountType = await this.service.create(req.tenantId, input);
    res.status(201).json(accountType);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateAccountTypeSchema.parse(req.body);
    const accountType = await this.service.update(req.params.id, input, req.tenantId);
    res.json(accountType);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await this.service.delete(req.params.id, req.tenantId);
    res.status(204).send();
  }
}
