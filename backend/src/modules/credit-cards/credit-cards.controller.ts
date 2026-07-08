import { Request, Response } from 'express';
import { CreditCardsService } from './credit-cards.service';
import {
  createCreditCardSchema,
  updateCreditCardSchema,
  createCardEntrySchema,
  updateCardEntrySchema,
  cardFlowQuerySchema,
  payInvoiceSchema,
  deleteCardEntryQuerySchema,
  findCardsQuerySchema,
} from './credit-cards.schemas';

export class CreditCardsController {
  constructor(private readonly service: CreditCardsService) {}

  // ─── Cards ────────────────────────────────────────────────────────────────────

  async findAll(req: Request, res: Response): Promise<void> {
    const { month, year } = findCardsQuerySchema.parse(req.query);
    const cards = await this.service.findAll(month, year);
    res.json(cards);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = createCreditCardSchema.parse(req.body);
    const card = await this.service.create(input);
    res.status(201).json(card);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = updateCreditCardSchema.parse(req.body);
    const card = await this.service.update(req.params.id, input);
    res.json(card);
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.service.softDelete(req.params.id);
    res.status(204).send();
  }

  // ─── Card flow ────────────────────────────────────────────────────────────────

  async getCardFlow(req: Request, res: Response): Promise<void> {
    const { month, year } = cardFlowQuerySchema.parse(req.query);
    const flow = await this.service.getCardFlow(req.params.id, month, year);
    res.json(flow);
  }

  // ─── Entries ──────────────────────────────────────────────────────────────────

  async createEntry(req: Request, res: Response): Promise<void> {
    const input = createCardEntrySchema.parse(req.body);
    const result = await this.service.createEntry(req.params.id, input);
    res.status(201).json(result);
  }

  async updateEntry(req: Request, res: Response): Promise<void> {
    const input = updateCardEntrySchema.parse(req.body);
    const entry = await this.service.updateEntry(
      req.params.id,
      req.params.entryId,
      input,
    );
    res.json(entry);
  }

  async deleteEntry(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteCardEntryQuerySchema.parse(req.query);
    await this.service.deleteEntry(req.params.id, req.params.entryId, scope, month, year);
    res.status(204).send();
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────

  async payInvoice(req: Request, res: Response): Promise<void> {
    const input = payInvoiceSchema.parse(req.body);
    const invoice = await this.service.payInvoice(
      req.params.id,
      req.params.invoiceId,
      input,
    );
    res.json(invoice);
  }

  async revertInvoice(req: Request, res: Response): Promise<void> {
    const invoice = await this.service.revertInvoice(
      req.params.id,
      req.params.invoiceId,
    );
    res.json(invoice);
  }
}
