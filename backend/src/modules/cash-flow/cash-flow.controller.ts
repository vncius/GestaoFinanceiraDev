import { Request, Response } from 'express';
import { CashFlowService } from './cash-flow.service';
import {
  cashFlowQuerySchema,
  createTransactionSchema,
  updateTransactionSchema,
  payActionSchema,
  deleteTransactionQuerySchema,
} from './cash-flow.schemas';

export class CashFlowController {
  constructor(private readonly service: CashFlowService) {}

  async getCashFlow(req: Request, res: Response): Promise<void> {
    const query = cashFlowQuerySchema.parse(req.query);
    const data = await this.service.getCashFlow(query);
    res.json(data);
  }

  // ─── Payments ──────────────────────────────────────────────────────────────

  async createPayment(req: Request, res: Response): Promise<void> {
    const input = createTransactionSchema.parse(req.body);
    const tx = await this.service.createPayment(input);
    res.status(201).json(tx);
  }

  async updatePayment(req: Request, res: Response): Promise<void> {
    const input = updateTransactionSchema.parse(req.body);
    const tx = await this.service.updatePayment(req.params.id, input);
    res.json(tx);
  }

  async deletePayment(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteTransactionQuerySchema.parse(req.query);
    await this.service.deletePayment(req.params.id, scope, month, year);
    res.status(204).send();
  }

  async payPayment(req: Request, res: Response): Promise<void> {
    const input = payActionSchema.parse(req.body);
    const tx = await this.service.payPayment(req.params.id, input);
    res.json(tx);
  }

  async revertPayment(req: Request, res: Response): Promise<void> {
    const tx = await this.service.revertPayment(req.params.id);
    res.json(tx);
  }

  // ─── Extra Expenses ────────────────────────────────────────────────────────

  async createExtraExpense(req: Request, res: Response): Promise<void> {
    const input = createTransactionSchema.parse(req.body);
    const tx = await this.service.createExtraExpense(input);
    res.status(201).json(tx);
  }

  async updateExtraExpense(req: Request, res: Response): Promise<void> {
    const input = updateTransactionSchema.parse(req.body);
    const tx = await this.service.updateExtraExpense(req.params.id, input);
    res.json(tx);
  }

  async deleteExtraExpense(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteTransactionQuerySchema.parse(req.query);
    await this.service.deleteExtraExpense(req.params.id, scope, month, year);
    res.status(204).send();
  }

  async payExtraExpense(req: Request, res: Response): Promise<void> {
    const input = payActionSchema.parse(req.body);
    const tx = await this.service.payExtraExpense(req.params.id, input);
    res.json(tx);
  }

  async revertExtraExpense(req: Request, res: Response): Promise<void> {
    const tx = await this.service.revertExtraExpense(req.params.id);
    res.json(tx);
  }
}
