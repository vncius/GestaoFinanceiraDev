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
    const categories = await this.service.findAll(type);
    res.json(categories);
  }

  async findById(req: Request, res: Response): Promise<void> {
    const category = await this.service.findById(req.params.id);
    res.json(category);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createCategorySchema.parse(req.body);
    const category = await this.service.create(input);
    res.status(201).json(category);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateCategorySchema.parse(req.body);
    const category = await this.service.update(req.params.id, input);
    res.json(category);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await this.service.delete(req.params.id);
    res.status(204).send();
  }
}
