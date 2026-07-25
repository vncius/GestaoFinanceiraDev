import { Request, Response } from 'express';
import { CreditCardInvoiceImportService } from './credit-card-invoice-import.service';
import { confirmInvoiceImportSchema, parseInvoiceImportSchema } from './credit-card-invoice-import.schemas';

export class CreditCardInvoiceImportController {
  constructor(private readonly service: CreditCardInvoiceImportService) {}

  async parse(req: Request, res: Response): Promise<void> {
    const input = parseInvoiceImportSchema.parse(req.body);
    const entries = await this.service.parseInvoice(req.params.id, req.tenantId, input.filename, input.content);
    res.json({ entries });
  }

  async confirm(req: Request, res: Response): Promise<void> {
    const input = confirmInvoiceImportSchema.parse(req.body);
    const result = await this.service.confirmImport(req.params.id, req.tenantId, input);
    res.status(201).json(result);
  }
}
