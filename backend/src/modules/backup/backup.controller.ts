import { Request, Response } from 'express';
import { BackupService } from './backup.service';
import { BackupBundle } from './backup.types';
import {
  exportCsvQuerySchema,
  importBackupSchema,
  importStatementSchema,
  parseStatementSchema,
  resetAccountSchema,
} from './backup.schemas';

export class BackupController {
  constructor(private readonly service: BackupService) {}

  async exportBackup(req: Request, res: Response): Promise<void> {
    const bundle = await this.service.exportBackup(req.tenantId);
    const filename = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(bundle);
  }

  async importBackup(req: Request, res: Response): Promise<void> {
    const input = importBackupSchema.parse(req.body);
    // O schema Zod valida a estrutura (cada entidade tem ao menos um `id`),
    // mas não replica os campos completos de cada entidade — o bundle vem
    // de um export gerado pelo próprio sistema.
    const result = await this.service.importBackup(req.tenantId, input.bundle as unknown as BackupBundle);
    res.json(result);
  }

  async resetAccount(req: Request, res: Response): Promise<void> {
    resetAccountSchema.parse(req.body);
    await this.service.resetTenant(req.tenantId);
    res.json({ ok: true });
  }

  async exportCsv(req: Request, res: Response): Promise<void> {
    // Não é XSS (falso positivo do Semgrep, que marca do req.query até o
    // res.send): a resposta é text/csv baixada como anexo, com nosniff do
    // helmet — nunca renderizada como HTML; fórmulas já neutralizadas no service.
    const query = exportCsvQuerySchema.parse(req.query); // nosemgrep: ajinabraham.njsscan.xss.xss_node.express_xss
    const csv = await this.service.exportTransactionsCsv(req.tenantId, query);
    const filename = `lancamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM para o Excel reconhecer UTF-8 corretamente.
    res.send('﻿' + csv); // nosemgrep: ajinabraham.njsscan.xss.xss_node.express_xss
  }

  async parseStatement(req: Request, res: Response): Promise<void> {
    const input = parseStatementSchema.parse(req.body);
    const entries = await this.service.parseStatement(req.tenantId, input.filename, input.content);
    res.json({ entries });
  }

  async importStatement(req: Request, res: Response): Promise<void> {
    const input = importStatementSchema.parse(req.body);
    const result = await this.service.importStatementEntries(req.tenantId, input);
    res.status(201).json(result);
  }
}
