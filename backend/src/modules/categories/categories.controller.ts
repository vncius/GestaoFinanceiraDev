import { Request, Response } from 'express';
import { CategoriesService } from './categories.service';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryQuerySchema,
} from './categories.schemas';

export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  async findAll(req: Request, res: Response): Promise<void> {
    const { type } = categoryQuerySchema.parse(req.query);
    const categories = await this.service.findAll(req.tenantId, type);
    res.json(categories);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const category = await this.service.findById(req.params.id, req.tenantId);
    res.json(category);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createCategorySchema.parse(req.body);
    const category = await this.service.create(req.tenantId, input);
    res.status(201).json(category);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateCategorySchema.parse(req.body);
    const category = await this.service.update(req.params.id, input, req.tenantId);
    res.json(category);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await this.service.delete(req.params.id, req.tenantId);
    res.status(204).send();
  }
}
