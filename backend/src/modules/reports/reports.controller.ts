import { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { statementQuerySchema } from './reports.schemas';

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  async getStatement(req: Request, res: Response): Promise<void> {
    const query = statementQuerySchema.parse(req.query);
    const data = await this.service.getStatement(req.tenantId, query);
    res.json(data);
  }
}
