import { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { statementQuerySchema, statementXlsxQuerySchema } from './reports.schemas';
import { buildStatementXlsx } from './reports.xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Slug ASCII: o nome da conta nunca entra cru no Content-Disposition.
const slug = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  async getStatement(req: Request, res: Response): Promise<void> {
    const query = statementQuerySchema.parse(req.query);
    const data = await this.service.getStatement(req.tenantId, query);
    res.json(data);
  }

  async getStatementXlsx(req: Request, res: Response): Promise<void> {
    const { lang, ...query } = statementXlsxQuerySchema.parse(req.query);
    const report = await this.service.getStatement(req.tenantId, query);
    const buffer = await buildStatementXlsx(report, lang);
    const scope = (report.scope.accountName && slug(report.scope.accountName)) || 'todas-as-contas';
    const filename = `extrato-${report.year}-${String(report.month).padStart(2, '0')}-${scope}.xlsx`;
    // Anexo binário com nosniff do helmet, nunca renderizado como HTML.
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer); // nosemgrep: ajinabraham.njsscan.xss.xss_node.express_xss
  }
}
