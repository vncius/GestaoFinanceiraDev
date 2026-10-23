import { Request, Response } from 'express';
import { CashFlowService } from './cash-flow.service';
import {
  cashFlowListQuerySchema,
  createTransactionSchema,
  updateTransactionSchema,
  updateTransactionQuerySchema,
  payActionSchema,
  deleteTransactionQuerySchema,
  createIncomeSchema,
  updateIncomeSchema,
  receiveActionSchema,
  accountContextQuerySchema,
} from './cash-flow.schemas';

export class CashFlowController {
  constructor(private readonly service: CashFlowService) {}

  async getCashFlow(req: Request, res: Response): Promise<void> {
    const { month, year, accountId } = cashFlowListQuerySchema.parse(req.query);
    const data = accountId
      ? await this.service.getCashFlow(req.tenantId, { month, year, accountId })
      : await this.service.getConsolidatedCashFlow(req.tenantId, month, year);
    res.json(data);
  }

  async getInvoiceTax(req: Request, res: Response): Promise<void> {
    res.json(await this.service.getInvoiceTax(req.params.id, req.tenantId));
  }

  // ─── Income ────────────────────────────────────────────────────────────────

  async createIncome(req: Request, res: Response): Promise<void> {
    const input = createIncomeSchema.parse(req.body);
    const { accountId } = accountContextQuerySchema.parse(req.query);
    const tx = await this.service.createIncome(req.tenantId, accountId, input);
    res.status(201).json(tx);
  }

  async updateIncome(req: Request, res: Response): Promise<void> {
    const input = updateIncomeSchema.parse(req.body);
    const { scope, month, year } = updateTransactionQuerySchema.parse(req.query);
    const tx = await this.service.updateIncome(req.params.id, input, req.tenantId, scope, month, year);
    res.json(tx);
  }

  async deleteIncome(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteTransactionQuerySchema.parse(req.query);
    await this.service.deleteIncome(req.params.id, req.tenantId, scope, month, year);
    res.status(204).send();
  }

  async receiveIncome(req: Request, res: Response): Promise<void> {
    const input = receiveActionSchema.parse(req.body);
    const tx = await this.service.receiveIncome(req.params.id, req.tenantId, input);
    res.json(tx);
  }

  async revertIncome(req: Request, res: Response): Promise<void> {
    const tx = await this.service.revertIncome(req.params.id, req.tenantId);
    res.json(tx);
  }

  // ─── Payments ──────────────────────────────────────────────────────────────

  async createPayment(req: Request, res: Response): Promise<void> {
    const input = createTransactionSchema.parse(req.body);
    const { accountId } = accountContextQuerySchema.parse(req.query);
    const tx = await this.service.createPayment(req.tenantId, accountId, input);
    res.status(201).json(tx);
  }

  async updatePayment(req: Request, res: Response): Promise<void> {
    const input = updateTransactionSchema.parse(req.body);
    const { scope, month, year } = updateTransactionQuerySchema.parse(req.query);
    const tx = await this.service.updatePayment(req.params.id, input, req.tenantId, scope, month, year);
    res.json(tx);
  }

  async deletePayment(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteTransactionQuerySchema.parse(req.query);
    await this.service.deletePayment(req.params.id, req.tenantId, scope, month, year);
    res.status(204).send();
  }

  async payPayment(req: Request, res: Response): Promise<void> {
    const input = payActionSchema.parse(req.body);
    const tx = await this.service.payPayment(req.params.id, req.tenantId, input);
    res.json(tx);
  }

  async revertPayment(req: Request, res: Response): Promise<void> {
    const tx = await this.service.revertPayment(req.params.id, req.tenantId);
    res.json(tx);
  }

  // ─── Extra Expenses ────────────────────────────────────────────────────────

  async createExtraExpense(req: Request, res: Response): Promise<void> {
    const input = createTransactionSchema.parse(req.body);
    const { accountId } = accountContextQuerySchema.parse(req.query);
    const tx = await this.service.createExtraExpense(req.tenantId, accountId, input);
    res.status(201).json(tx);
  }

  async updateExtraExpense(req: Request, res: Response): Promise<void> {
    const input = updateTransactionSchema.parse(req.body);
    const { scope, month, year } = updateTransactionQuerySchema.parse(req.query);
    const tx = await this.service.updateExtraExpense(req.params.id, input, req.tenantId, scope, month, year);
    res.json(tx);
  }

  async deleteExtraExpense(req: Request, res: Response): Promise<void> {
    const { scope, month, year } = deleteTransactionQuerySchema.parse(req.query);
    await this.service.deleteExtraExpense(req.params.id, req.tenantId, scope, month, year);
    res.status(204).send();
  }

  async payExtraExpense(req: Request, res: Response): Promise<void> {
    const input = payActionSchema.parse(req.body);
    const tx = await this.service.payExtraExpense(req.params.id, req.tenantId, input);
    res.json(tx);
  }

  async revertExtraExpense(req: Request, res: Response): Promise<void> {
    const tx = await this.service.revertExtraExpense(req.params.id, req.tenantId);
    res.json(tx);
  }
}
