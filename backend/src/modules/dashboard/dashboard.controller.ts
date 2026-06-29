import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { dashboardQuerySchema } from './dashboard.schemas';

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  async getDashboard(req: Request, res: Response): Promise<void> {
    const query = dashboardQuerySchema.parse(req.query);
    const data = await this.service.getDashboard(query);
    res.json(data);
  }
}
